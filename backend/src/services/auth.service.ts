import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/database';
import { redisClient } from '../config/redis';
import { EmailService } from './email.service';
import { GoogleAuthService } from './oauth/google-auth.service';
import { FacebookAuthService } from './oauth/facebook-auth.service';
import { 
  UnauthorizedError, 
  ValidationError, 
  NotFoundError 
} from '../middleware/error.middleware';
import { logger } from '../utils/logger';

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  company?: string;
}

interface LoginData {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

interface AuthResponse {
  user: any;
  token: string;
  refreshToken: string;
}

export class AuthService {
  private emailService: EmailService;
  private googleAuthService: GoogleAuthService;
  private facebookAuthService: FacebookAuthService;

  constructor() {
    this.emailService = new EmailService();
    this.googleAuthService = new GoogleAuthService();
    this.facebookAuthService = new FacebookAuthService();
  }

  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<AuthResponse> {
    const { email, password, firstName, lastName, company } = data;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate email verification token
    const emailVerifyToken = uuidv4();

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        company,
        emailVerifyToken,
        status: 'PENDING'
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        company: true,
        role: true,
        status: true,
        profileImage: true,
        createdAt: true
      }
    });

    // Send verification email
    await this.emailService.sendVerificationEmail(user.email, emailVerifyToken);

    // Generate tokens
    const { token, refreshToken } = await this.generateTokens(user.id);

    return {
      user,
      token,
      refreshToken
    };
  }

  /**
   * Login user
   */
  async login(data: LoginData): Promise<AuthResponse> {
    const { email, password, ipAddress, userAgent } = data;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        firstName: true,
        lastName: true,
        company: true,
        role: true,
        status: true,
        emailVerified: true,
        profileImage: true,
        createdAt: true
      }
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Check account status
    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedError('Your account has been suspended');
    }

    if (!user.emailVerified) {
      throw new UnauthorizedError('Please verify your email before logging in');
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Generate tokens
    const { token, refreshToken } = await this.generateTokens(user.id);

    // Create session
    await this.createSession(user.id, token, refreshToken, ipAddress, userAgent);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      token,
      refreshToken
    };
  }

  /**
   * Logout user
   */
  async logout(token: string): Promise<void> {
    // Add token to blacklist
    const decoded = jwt.decode(token) as any;
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    
    if (ttl > 0) {
      await redisClient.setex(`blacklist:${token}`, ttl, '1');
    }

    // Delete session
    const session = await prisma.session.findUnique({
      where: { token }
    });

    if (session) {
      await prisma.session.delete({
        where: { id: session.id }
      });
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
    // Find session
    const session = await prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true }
    });

    if (!session) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Check if session expired
    if (session.expiresAt < new Date()) {
      await prisma.session.delete({
        where: { id: session.id }
      });
      throw new UnauthorizedError('Refresh token expired');
    }

    // Generate new tokens
    const { token: newToken, refreshToken: newRefreshToken } = await this.generateTokens(session.userId);

    // Update session
    await prisma.session.update({
      where: { id: session.id },
      data: {
        token: newToken,
        refreshToken: newRefreshToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      }
    });

    return {
      token: newToken,
      refreshToken: newRefreshToken
    };
  }

  /**
   * Forgot password
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      // Don't reveal if user exists
      return;
    }

    // Generate reset token
    const resetToken = uuidv4();
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Save reset token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires
      }
    });

    // Send reset email
    await this.emailService.sendPasswordResetEmail(user.email, resetToken);
  }

  /**
   * Reset password
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: {
          gt: new Date()
        }
      }
    });

    if (!user) {
      throw new ValidationError('Invalid or expired reset token');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and clear reset token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null
      }
    });

    // Send confirmation email
    await this.emailService.sendPasswordChangedEmail(user.email);

    // Invalidate all sessions
    await prisma.session.deleteMany({
      where: { userId: user.id }
    });
  }

  /**
   * Verify email
   */
  async verifyEmail(token: string): Promise<AuthResponse> {
    const user = await prisma.user.findFirst({
      where: {
        emailVerifyToken: token,
        emailVerified: false
      }
    });

    if (!user) {
      throw new ValidationError('Invalid verification token');
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifyToken: null,
        status: 'ACTIVE'
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        company: true,
        role: true,
        status: true,
        profileImage: true,
        createdAt: true
      }
    });

    // Generate tokens
    const { token, refreshToken } = await this.generateTokens(user.id);

    // Send welcome email
    await this.emailService.sendWelcomeEmail(user.email, user.firstName);

    return {
      user: updatedUser,
      token,
      refreshToken
    };
  }

  /**
   * Resend verification email
   */
  async resendVerification(email: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user || user.emailVerified) {
      return;
    }

    // Generate new token if needed
    let verifyToken = user.emailVerifyToken;
    if (!verifyToken) {
      verifyToken = uuidv4();
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifyToken: verifyToken }
      });
    }

    // Send verification email
    await this.emailService.sendVerificationEmail(user.email, verifyToken);
  }

  /**
   * Get Google OAuth URL
   */
  async getGoogleAuthUrl(): Promise<string> {
    return this.googleAuthService.getAuthUrl();
  }

  /**
   * Handle Google OAuth callback
   */
  async handleGoogleCallback(code: string): Promise<AuthResponse> {
    const googleUser = await this.googleAuthService.handleCallback(code);
    return this.handleOAuthLogin(googleUser, 'GOOGLE');
  }

  /**
   * Get Facebook OAuth URL
   */
  async getFacebookAuthUrl(): Promise<string> {
    return this.facebookAuthService.getAuthUrl();
  }

  /**
   * Handle Facebook OAuth callback
   */
  async handleFacebookCallback(code: string): Promise<AuthResponse> {
    const facebookUser = await this.facebookAuthService.handleCallback(code);
    return this.handleOAuthLogin(facebookUser, 'FACEBOOK');
  }

  /**
   * Handle OAuth login
   */
  private async handleOAuthLogin(oauthUser: any, provider: string): Promise<AuthResponse> {
    // Find or create user
    let user = await prisma.user.findUnique({
      where: { email: oauthUser.email }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: oauthUser.email,
          password: await bcrypt.hash(uuidv4(), 12), // Random password
          firstName: oauthUser.firstName || oauthUser.email.split('@')[0],
          lastName: oauthUser.lastName || '',
          profileImage: oauthUser.picture,
          emailVerified: true,
          status: 'ACTIVE'
        }
      });
    } else if (!user.emailVerified) {
      // Verify email if logging in with OAuth
      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          status: 'ACTIVE'
        }
      });
    }

    // Generate tokens
    const { token, refreshToken } = await this.generateTokens(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        company: user.company,
        role: user.role,
        status: user.status,
        profileImage: user.profileImage,
        createdAt: user.createdAt
      },
      token,
      refreshToken
    };
  }

  /**
   * Generate JWT tokens
   */
  private async generateTokens(userId: string): Promise<{ token: string; refreshToken: string }> {
    const token = jwt.sign(
      { userId },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' }
    );

    const refreshToken = jwt.sign(
      { userId, type: 'refresh' },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    );

    return { token, refreshToken };
  }

  /**
   * Create user session
   */
  private async createSession(
    userId: string,
    token: string,
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await prisma.session.create({
      data: {
        userId,
        token,
        refreshToken,
        ipAddress,
        userAgent,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      }
    });
  }
}