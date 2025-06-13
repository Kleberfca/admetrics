// backend/src/controllers/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthService, LoginCredentials, RegisterData } from '../services/auth.service';
import { logger } from '../utils/logger';
import { ValidationError } from '../middleware/error.middleware';

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
      'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character'),
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  organizationName: z.string().max(100).optional(),
  acceptTerms: z.boolean().refine(val => val === true, 'You must accept the terms and conditions')
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional()
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required')
});

const requestPasswordResetSchema = z.object({
  email: z.string().email('Invalid email format')
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
      'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character')
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
      'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character')
});

const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  avatar: z.string().url().optional(),
  preferences: z.any().optional()
});

const createApiKeySchema = z.object({
  name: z.string().min(1, 'API key name is required').max(100),
  permissions: z.any().optional()
});

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  /**
   * Register a new user
   */
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const controller = new AuthController();
      const data = registerSchema.parse(req.body);

      const result = await controller.authService.register(data);

      // Set refresh token as HTTP-only cookie
      res.cookie('refreshToken', result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.status(201).json({
        success: true,
        message: 'User registered successfully. Please check your email to verify your account.',
        data: {
          user: result.user,
          accessToken: result.tokens.accessToken,
          expiresIn: result.tokens.expiresIn
        }
      });

      logger.info(`User registered: ${data.email}`);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new ValidationError('Validation failed', error.errors));
      }
      next(error);
    }
  }

  /**
   * Login user
   */
  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const controller = new AuthController();
      const credentials = loginSchema.parse(req.body);

      const result = await controller.authService.login(credentials);

      // Set refresh token as HTTP-only cookie
      res.cookie('refreshToken', result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: credentials.rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
      });

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: result.user,
          accessToken: result.tokens.accessToken,
          expiresIn: result.tokens.expiresIn
        }
      });

      logger.info(`User logged in: ${credentials.email}`);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new ValidationError('Validation failed', error.errors));
      }
      next(error);
    }
  }

  /**
   * Refresh access token
   */
  static async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const controller = new AuthController();
      
      // Get refresh token from cookie or body
      const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
      
      if (!refreshToken) {
        return res.status(401).json({
          success: false,
          message: 'Refresh token not provided'
        });
      }

      const tokens = await controller.authService.refreshToken(refreshToken);

      // Set new refresh token as HTTP-only cookie
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken: tokens.accessToken,
          expiresIn: tokens.expiresIn
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Logout user
   */
  static async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const controller = new AuthController();
      const userId = req.user!.id;
      const refreshToken = req.cookies.refreshToken;

      await controller.authService.logout(userId, refreshToken);

      // Clear refresh token cookie
      res.clearCookie('refreshToken');

      res.json({
        success: true,
        message: 'Logout successful'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify email address
   */
  static async verifyEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const controller = new AuthController();
      const { token } = verifyEmailSchema.parse(req.body);

      const result = await controller.authService.verifyEmail(token);

      res.json({
        success: result.success,
        message: result.message
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new ValidationError('Validation failed', error.errors));
      }
      next(error);
    }
  }

  /**
   * Request password reset
   */
  static async requestPasswordReset(req: Request, res: Response, next: NextFunction) {
    try {
      const controller = new AuthController();
      const { email } = requestPasswordResetSchema.parse(req.body);

      const result = await controller.authService.requestPasswordReset(email);

      res.json({
        success: result.success,
        message: result.message
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new ValidationError('Validation failed', error.errors));
      }
      next(error);
    }
  }

  /**
   * Reset password
   */
  static async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const controller = new AuthController();
      const data = resetPasswordSchema.parse(req.body);

      const result = await controller.authService.resetPassword(data);

      res.json({
        success: result.success,
        message: result.message
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new ValidationError('Validation failed', error.errors));
      }
      next(error);
    }
  }

  /**
   * Get current user profile
   */
  static async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const controller = new AuthController();
      const userId = req.user!.id;

      const profile = await controller.authService.getUserProfile(userId);

      res.json({
        success: true,
        data: profile
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user profile
   */
  static async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const controller = new AuthController();
      const userId = req.user!.id;
      const updates = updateProfileSchema.parse(req.body);

      const profile = await controller.authService.updateProfile(userId, updates);

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: profile
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new ValidationError('Validation failed', error.errors));
      }
      next(error);
    }
  }

  /**
   * Change password
   */
  static async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const controller = new AuthController();
      const userId = req.user!.id;
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

      const result = await controller.authService.changePassword(userId, currentPassword, newPassword);

      res.json({
        success: result.success,
        message: result.message
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new ValidationError('Validation failed', error.errors));
      }
      next(error);
    }
  }

  /**
   * Create API key
   */
  static async createApiKey(req: Request, res: Response, next: NextFunction) {
    try {
      const controller = new AuthController();
      const userId = req.user!.id;
      const { name, permissions } = createApiKeySchema.parse(req.body);

      const apiKey = await controller.authService.createApiKey(userId, name, permissions);

      res.status(201).json({
        success: true,
        message: 'API key created successfully',
        data: {
          id: apiKey.id,
          name: apiKey.name,
          key: apiKey.key, // Only shown once
          createdAt: apiKey.createdAt
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new ValidationError('Validation failed', error.errors));
      }
      next(error);
    }
  }

  /**
   * Get user's API keys (without the actual key values)
   */
  static async getApiKeys(req: Request, res: Response, next: NextFunction) {
    try {
      const controller = new AuthController();
      const userId = req.user!.id;

      // This would be implemented in the auth service
      // For now, just return a placeholder response
      res.json({
        success: true,
        data: {
          apiKeys: []
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Revoke API key
   */
  static async revokeApiKey(req: Request, res: Response, next: NextFunction) {
    try {
      const controller = new AuthController();
      const userId = req.user!.id;
      const keyId = req.params.keyId;

      // This would be implemented in the auth service
      // For now, just return a placeholder response
      res.json({
        success: true,
        message: 'API key revoked successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get authentication status/health
   */
  static async getAuthStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const controller = new AuthController();
      const health = controller.authService.getHealth();

      res.json({
        success: true,
        data: {
          status: health.status,
          uptime: health.uptime,
          metrics: controller.authService.getMetrics()
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

// Route definitions for easy import
export const authRoutes = {
  'POST /auth/register': AuthController.register,
  'POST /auth/login': AuthController.login,
  'POST /auth/refresh': AuthController.refreshToken,
  'POST /auth/logout': AuthController.logout,
  'POST /auth/verify-email': AuthController.verifyEmail,
  'POST /auth/request-password-reset': AuthController.requestPasswordReset,
  'POST /auth/reset-password': AuthController.resetPassword,
  'GET /auth/profile': AuthController.getProfile,
  'PUT /auth/profile': AuthController.updateProfile,
  'POST /auth/change-password': AuthController.changePassword,
  'POST /auth/api-keys': AuthController.createApiKey,
  'GET /auth/api-keys': AuthController.getApiKeys,
  'DELETE /auth/api-keys/:keyId': AuthController.revokeApiKey,
  'GET /auth/status': AuthController.getAuthStatus
};