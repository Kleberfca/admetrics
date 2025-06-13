// backend/src/services/auth.service.ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { PrismaClient, User, ApiKey } from '@prisma/client';
import { logger } from '../utils/logger';
import { BaseService } from './base.service';
import { sendEmail } from '../utils/email';

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName?: string;
  acceptTerms: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ResetPasswordData {
  token: string;
  newPassword: string;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  role: string;
  isEmailVerified: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  preferences?: any;
  organizations?: Array<{
    id: string;
    name: string;
    role: string;
  }>;
}

export class AuthService extends BaseService {
  private prisma: PrismaClient;
  private readonly JWT_SECRET: string;
  private readonly JWT_REFRESH_SECRET: string;
  private readonly TOKEN_EXPIRY = '15m';
  private readonly REFRESH_TOKEN_EXPIRY = '7d';
  private readonly RESET_TOKEN_EXPIRY = '1h';

  constructor() {
    super({
      rateLimit: {
        maxRequests: 10,
        windowMs: 60000, // 1 minute
        retryAfterMs: 60000
      },
      timeout: 5000
    });

    this.prisma = new PrismaClient();
    this.JWT_SECRET = process.env.JWT_SECRET!;
    this.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

    if (!this.JWT_SECRET || !this.JWT_REFRESH_SECRET) {
      throw new Error('JWT secrets not configured');
    }
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { success: true, message: 'Database connection successful' };
    } catch (error) {
      return { success: false, message: `Database connection failed: ${error.message}` };
    }
  }

  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    return this.executeWithPolicy('register', async () => {
      // Check if user already exists
      const existingUser = await this.prisma.user.findUnique({
        where: { email: data.email.toLowerCase() }
      });

      if (existingUser) {
        throw new Error('User already exists with this email');
      }

      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(data.password, saltRounds);

      // Generate email verification token
      const emailVerificationToken = crypto.randomBytes(32).toString('hex');

      // Create user with transaction
      const result = await this.prisma.$transaction(async (tx) => {
        // Create user
        const user = await tx.user.create({
          data: {
            email: data.email.toLowerCase(),
            passwordHash: hashedPassword,
            firstName: data.firstName,
            lastName: data.lastName,
            role: 'USER',
            emailVerificationToken,
            emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            preferences: {
              notifications: {
                email: true,
                push: true,
                marketing: false
              },
              dashboard: {
                theme: 'light',
                timezone: 'UTC'
              }
            }
          },
          include: {
            organizationMembers: {
              include: {
                organization: true
              }
            }
          }
        });

        // Create organization if provided
        if (data.organizationName) {
          const organization = await tx.organization.create({
            data: {
              name: data.organizationName,
              ownerId: user.id,
              members: {
                create: {
                  userId: user.id,
                  role: 'OWNER'
                }
              }
            }
          });

          logger.info(`Organization created: ${organization.name} for user: ${user.email}`);
        }

        return user;
      });

      // Send verification email
      await this.sendVerificationEmail(result.email, emailVerificationToken);

      // Generate tokens
      const tokens = await this.generateTokens(result.id);

      // Update last login
      await this.prisma.user.update({
        where: { id: result.id },
        data: { lastLoginAt: new Date() }
      });

      logger.info(`User registered: ${result.email}`);

      return {
        user: this.mapUserProfile(result),
        tokens
      };
    });
  }

  /**
   * Login user
   */
  async login(credentials: LoginCredentials): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    return this.executeWithPolicy('login', async () => {
      // Find user
      const user = await this.prisma.user.findUnique({
        where: { email: credentials.email.toLowerCase() },
        include: {
          organizationMembers: {
            include: {
              organization: true
            }
          }
        }
      });

      if (!user) {
        throw new Error('Invalid email or password');
      }

      // Check if account is locked
      if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
        throw new Error('Account is temporarily locked due to multiple failed login attempts');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(credentials.password, user.passwordHash);

      if (!isPasswordValid) {
        // Increment failed login attempts
        await this.handleFailedLogin(user.id);
        throw new Error('Invalid email or password');
      }

      // Reset login attempts on successful login
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          accountLockedUntil: null,
          lastLoginAt: new Date()
        }
      });

      // Generate tokens
      const tokenExpiry = credentials.rememberMe ? '30d' : this.TOKEN_EXPIRY;
      const tokens = await this.generateTokens(user.id, tokenExpiry);

      logger.info(`User logged in: ${user.email}`);

      return {
        user: this.mapUserProfile(user),
        tokens
      };
    });
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    return this.executeWithPolicy('refresh_token', async () => {
      try {
        const payload = jwt.verify(refreshToken, this.JWT_REFRESH_SECRET) as any;
        
        // Check if user still exists
        const user = await this.prisma.user.findUnique({
          where: { id: payload.userId }
        });

        if (!user) {
          throw new Error('User not found');
        }

        // Generate new tokens
        return await this.generateTokens(user.id);

      } catch (error) {
        throw new Error('Invalid refresh token');
      }
    });
  }

  /**
   * Logout user (invalidate tokens)
   */
  async logout(userId: string, refreshToken?: string): Promise<void> {
    return this.executeWithPolicy('logout', async () => {
      // In a production system, you would add the tokens to a blacklist
      // For now, we'll just log the logout
      logger.info(`User logged out: ${userId}`);
      
      // Update last activity
      await this.prisma.user.update({
        where: { id: userId },
        data: { lastActivityAt: new Date() }
      });
    });
  }

  /**
   * Verify email address
   */
  async verifyEmail(token: string): Promise<{ success: boolean; message: string }> {
    return this.executeWithPolicy('verify_email', async () => {
      const user = await this.prisma.user.findFirst({
        where: {
          emailVerificationToken: token,
          emailVerificationExpires: {
            gt: new Date()
          }
        }
      });

      if (!user) {
        return { success: false, message: 'Invalid or expired verification token' };
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          isEmailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpires: null
        }
      });

      logger.info(`Email verified for user: ${user.email}`);

      return { success: true, message: 'Email verified successfully' };
    });
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    return this.executeWithPolicy('request_password_reset', async () => {
      const user = await this.prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (!user) {
        // Don't reveal if email exists
        return { success: true, message: 'If the email exists, a reset link has been sent' };
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: resetToken,
          passwordResetExpires: resetExpires
        }
      });

      // Send reset email
      await this.sendPasswordResetEmail(user.email, resetToken);

      logger.info(`Password reset requested for: ${user.email}`);

      return { success: true, message: 'If the email exists, a reset link has been sent' };
    });
  }

  /**
   * Reset password
   */
  async resetPassword(data: ResetPasswordData): Promise<{ success: boolean; message: string }> {
    return this.executeWithPolicy('reset_password', async () => {
      const user = await this.prisma.user.findFirst({
        where: {
          passwordResetToken: data.token,
          passwordResetExpires: {
            gt: new Date()
          }
        }
      });

      if (!user) {
        return { success: false, message: 'Invalid or expired reset token' };
      }

      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(data.newPassword, saltRounds);

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashedPassword,
          passwordResetToken: null,
          passwordResetExpires: null,
          failedLoginAttempts: 0,
          accountLockedUntil: null
        }
      });

      logger.info(`Password reset completed for: ${user.email}`);

      return { success: true, message: 'Password reset successfully' };
    });
  }

  /**
   * Get user profile
   */
  async getUserProfile(userId: string): Promise<UserProfile> {
    return this.executeWithPolicy('get_profile', async () => {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          organizationMembers: {
            include: {
              organization: true
            }
          }
        }
      });

      if (!user) {
        throw new Error('User not found');
      }

      return this.mapUserProfile(user);
    });
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    return this.executeWithPolicy('update_profile', async () => {
      const updateData: any = {};

      if (updates.firstName) updateData.firstName = updates.firstName;
      if (updates.lastName) updateData.lastName = updates.lastName;
      if (updates.avatar) updateData.avatar = updates.avatar;
      if (updates.preferences) updateData.preferences = updates.preferences;

      const user = await this.prisma.user.update({
        where: { id: userId },
        data: updateData,
        include: {
          organizationMembers: {
            include: {
              organization: true
            }
          }
        }
      });

      logger.info(`Profile updated for user: ${user.email}`);

      return this.mapUserProfile(user);
    });
  }

  /**
   * Change password
   */
  async changePassword(
    userId: string, 
    currentPassword: string, 
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    return this.executeWithPolicy('change_password', async () => {
      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isCurrentPasswordValid) {
        return { success: false, message: 'Current password is incorrect' };
      }

      // Hash new password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      await this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: hashedPassword }
      });

      logger.info(`Password changed for user: ${user.email}`);

      return { success: true, message: 'Password changed successfully' };
    });
  }

  /**
   * Create API key
   */
  async createApiKey(userId: string, name: string, permissions?: any): Promise<ApiKey> {
    return this.executeWithPolicy('create_api_key', async () => {
      const key = crypto.randomBytes(32).toString('hex');
      const hashedKey = await bcrypt.hash(key, 10);

      const apiKey = await this.prisma.apiKey.create({
        data: {
          userId,
          name,
          key: hashedKey,
          permissions
        }
      });

      logger.info(`API key created for user: ${userId}`);

      // Return the key with the actual value (only time it's shown)
      return {
        ...apiKey,
        key // Return unhashed key for user to copy
      } as ApiKey;
    });
  }

  // Private helper methods

  private async generateTokens(userId: string, accessTokenExpiry?: string): Promise<AuthTokens> {
    const payload = { userId };
    const expiry = accessTokenExpiry || this.TOKEN_EXPIRY;

    const accessToken = jwt.sign(payload, this.JWT_SECRET, { expiresIn: expiry });
    const refreshToken = jwt.sign(payload, this.JWT_REFRESH_SECRET, { 
      expiresIn: this.REFRESH_TOKEN_EXPIRY 
    });

    // Calculate expiry time in seconds
    const expiresIn = expiry === '30d' ? 30 * 24 * 60 * 60 : 15 * 60;

    return {
      accessToken,
      refreshToken,
      expiresIn
    };
  }

  private async handleFailedLogin(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) return;

    const attempts = (user.failedLoginAttempts || 0) + 1;
    const lockUntil = attempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null; // 30 minutes

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: attempts,
        accountLockedUntil: lockUntil
      }
    });

    if (lockUntil) {
      logger.warn(`Account locked for user: ${user.email} after ${attempts} failed attempts`);
    }
  }

  private mapUserProfile(user: any): UserProfile {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar: user.avatar,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      preferences: user.preferences,
      organizations: user.organizationMembers?.map((member: any) => ({
        id: member.organization.id,
        name: member.organization.name,
        role: member.role
      }))
    };
  }

  private async sendVerificationEmail(email: string, token: string): Promise<void> {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
    
    await sendEmail({
      to: email,
      subject: 'Verify your AdMetrics account',
      template: 'email-verification',
      context: {
        verificationUrl
      }
    });
  }

  private async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    
    await sendEmail({
      to: email,
      subject: 'Reset your AdMetrics password',
      template: 'password-reset',
      context: {
        resetUrl
      }
    });
  }
}