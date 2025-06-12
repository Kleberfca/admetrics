// backend/src/controllers/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { sendEmail } from '../utils/email';
import { generateResetToken, verifyResetToken } from '../utils/tokens';

const prisma = new PrismaClient();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  timezone: z.string().optional().default('UTC'),
  language: z.string().optional().default('en')
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required')
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format')
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

// Helper functions
const generateTokens = (userId: string) => {
  const accessToken = jwt.sign(
    { userId, type: 'access' },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

export class AuthController {
  /**
   * Register new user
   */
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      // Validate request body
      const { email, password, name, timezone, language } = registerSchema.parse(req.body);

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'User already exists',
          message: 'An account with this email already exists'
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          timezone,
          language,
          emailVerified: process.env.NODE_ENV === 'development' // Auto-verify in dev
        },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          role: true,
          timezone: true,
          language: true,
          emailVerified: true,
          preferences: true,
          createdAt: true
        }
      });

      // Generate tokens
      const { accessToken, refreshToken } = generateTokens(user.id);

      // Store refresh token
      await prisma.userSession.create({
        data: {
          userId: user.id,
          token: refreshToken,
          userAgent: req.get('User-Agent'),
          ipAddress: req.ip,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        }
      });

      logger.info(`New user registered: ${email}`);

      res.status(201).json({
        success: true,
        user,
        token: accessToken,
        refreshToken,
        message: 'Account created successfully'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
      }

      logger.error('Registration error:', error);
      next(error);
    }
  }

  /**
   * Login user
   */
  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      // Validate request body
      const { email, password } = loginSchema.parse(req.body);

      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          password: true,
          role: true,
          timezone: true,
          language: true,
          emailVerified: true,
          isActive: true,
          preferences: true,
          lastLoginAt: true
        }
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials',
          message: 'Email or password is incorrect'
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          error: 'Account disabled',
          message: 'Your account has been disabled. Please contact support.'
        });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials',
          message: 'Email or password is incorrect'
        });
      }

      // Generate tokens
      const { accessToken, refreshToken } = generateTokens(user.id);

      // Store refresh token
      await prisma.userSession.create({
        data: {
          userId: user.id,
          token: refreshToken,
          userAgent: req.get('User-Agent'),
          ipAddress: req.ip,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      });

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      logger.info(`User logged in: ${email}`);

      res.json({
        success: true,
        user: userWithoutPassword,
        token: accessToken,
        refreshToken,
        message: 'Login successful'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
      }

      logger.error('Login error:', error);
      next(error);
    }
  }

  /**
   * Refresh access token
   */
  static async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = refreshTokenSchema.parse(req.body);

      // Verify refresh token
      let payload;
      try {
        payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as any;
      } catch (error) {
        return res.status(401).json({
          success: false,
          error: 'Invalid refresh token',
          message: 'Please log in again'
        });
      }

      // Check if refresh token exists in database
      const session = await prisma.userSession.findUnique({
        where: { token: refreshToken },
        include: { user: true }
      });

      if (!session || !session.isValid || session.expiresAt < new Date()) {
        return res.status(401).json({
          success: false,
          error: 'Invalid refresh token',
          message: 'Please log in again'
        });
      }

      // Generate new access token
      const { accessToken } = generateTokens(session.userId);

      res.json({
        success: true,
        token: accessToken,
        message: 'Token refreshed successfully'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
      }

      logger.error('Token refresh error:', error);
      next(error);
    }
  }

  /**
   * Logout user
   */
  static async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.body.refreshToken;

      if (refreshToken) {
        // Invalidate refresh token
        await prisma.userSession.updateMany({
          where: { token: refreshToken },
          data: { isValid: false }
        });
      }

      res.json({
        success: true,
        message: 'Logged out successfully'
      });

    } catch (error) {
      logger.error('Logout error:', error);
      next(error);
    }
  }

  /**
   * Forgot password
   */
  static async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);

      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true }
      });

      // Don't reveal if user exists or not
      res.json({
        success: true,
        message: 'If an account with this email exists, you will receive a password reset link'
      });

      if (user) {
        // Generate reset token
        const resetToken = generateResetToken();
        const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        // Store reset token (you might want to create a separate table for this)
        await prisma.user.update({
          where: { id: user.id },
          data: {
            // Add resetToken and resetTokenExpires fields to User model
            // resetToken,
            // resetTokenExpires
          }
        });

        // Send reset email
        await sendEmail({
          to: user.email,
          subject: 'Password Reset Request',
          template: 'password-reset',
          data: {
            name: user.name,
            resetLink: `${process.env.FRONTEND_URL}/auth/reset-password?token=${resetToken}`
          }
        });

        logger.info(`Password reset requested for: ${email}`);
      }

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
      }

      logger.error('Forgot password error:', error);
      next(error);
    }
  }

  /**
   * Reset password
   */
  static async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { token, password } = resetPasswordSchema.parse(req.body);

      // Verify reset token
      if (!verifyResetToken(token)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid or expired reset token'
        });
      }

      // Find user by reset token
      const user = await prisma.user.findFirst({
        where: {
          // resetToken: token,
          // resetTokenExpires: { gt: new Date() }
        }
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          error: 'Invalid or expired reset token'
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Update password and clear reset token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          // resetToken: null,
          // resetTokenExpires: null
        }
      });

      // Invalidate all user sessions
      await prisma.userSession.updateMany({
        where: { userId: user.id },
        data: { isValid: false }
      });

      logger.info(`Password reset completed for user: ${user.id}`);

      res.json({
        success: true,
        message: 'Password reset successfully'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors
        });
      }

      logger.error('Reset password error:', error);
      next(error);
    }
  }

  /**
   * Get current user profile
   */
  static async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          role: true,
          timezone: true,
          language: true,
          emailVerified: true,
          preferences: true,
          createdAt: true,
          lastLoginAt: true
        }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      res.json({
        success: true,
        user
      });

    } catch (error) {
      logger.error('Get profile error:', error);
      next(error);
    }
  }

  /**
   * Update user profile
   */
  static async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      const { name, timezone, language, preferences } = req.body;

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(name && { name }),
          ...(timezone && { timezone }),
          ...(language && { language }),
          ...(preferences && { preferences })
        },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          role: true,
          timezone: true,
          language: true,
          emailVerified: true,
          preferences: true,
          updatedAt: true
        }
      });

      res.json({
        success: true,
        user: updatedUser,
        message: 'Profile updated successfully'
      });

    } catch (error) {
      logger.error('Update profile error:', error);
      next(error);
    }
  }
}