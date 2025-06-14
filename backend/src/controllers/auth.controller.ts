import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { AppError, ValidationError } from '../middleware/error.middleware';

export class AuthController {
  private static authService = new AuthService();

  /**
   * Register a new user
   */
  static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, firstName, lastName, company } = req.body;

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        throw new ValidationError('Email already registered');
      }

      // Create user
      const result = await AuthController.authService.register({
        email,
        password,
        firstName,
        lastName,
        company
      });

      logger.info('User registered successfully', { userId: result.user.id, email });

      res.status(201).json({
        success: true,
        message: 'Registration successful. Please check your email to verify your account.',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Login user
   */
  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;
      const ipAddress = req.ip;
      const userAgent = req.get('user-agent') || '';

      const result = await AuthController.authService.login({
        email,
        password,
        ipAddress,
        userAgent
      });

      logger.info('User logged in successfully', { userId: result.user.id, email });

      res.json({
        success: true,
        message: 'Login successful',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Logout user
   */
  static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.token;
      const userId = req.user?.id;

      if (token) {
        await AuthController.authService.logout(token);
      }

      logger.info('User logged out successfully', { userId });

      res.json({
        success: true,
        message: 'Logout successful'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Refresh access token
   */
  static async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;

      const result = await AuthController.authService.refreshToken(refreshToken);

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Forgot password
   */
  static async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;

      await AuthController.authService.forgotPassword(email);

      res.json({
        success: true,
        message: 'Password reset instructions sent to your email'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reset password
   */
  static async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, password } = req.body;

      await AuthController.authService.resetPassword(token, password);

      logger.info('Password reset successful');

      res.json({
        success: true,
        message: 'Password reset successful. You can now login with your new password.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify email
   */
  static async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.params;

      const result = await AuthController.authService.verifyEmail(token);

      logger.info('Email verified successfully', { userId: result.user.id });

      res.json({
        success: true,
        message: 'Email verified successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Resend verification email
   */
  static async resendVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;

      await AuthController.authService.resendVerification(email);

      res.json({
        success: true,
        message: 'Verification email sent'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Google OAuth authentication
   */
  static async googleAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authUrl = await AuthController.authService.getGoogleAuthUrl();

      res.redirect(authUrl);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Google OAuth callback
   */
  static async googleCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code } = req.query;

      if (!code || typeof code !== 'string') {
        throw new ValidationError('Invalid authorization code');
      }

      const result = await AuthController.authService.handleGoogleCallback(code);

      // Redirect to frontend with tokens
      const redirectUrl = new URL(process.env.FRONTEND_URL || 'http://localhost:3001');
      redirectUrl.pathname = '/auth/callback';
      redirectUrl.searchParams.append('token', result.token);
      redirectUrl.searchParams.append('refreshToken', result.refreshToken);

      res.redirect(redirectUrl.toString());
    } catch (error) {
      // Redirect to frontend with error
      const redirectUrl = new URL(process.env.FRONTEND_URL || 'http://localhost:3001');
      redirectUrl.pathname = '/auth/error';
      redirectUrl.searchParams.append('error', 'authentication_failed');

      res.redirect(redirectUrl.toString());
    }
  }

  /**
   * Facebook OAuth authentication
   */
  static async facebookAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authUrl = await AuthController.authService.getFacebookAuthUrl();

      res.redirect(authUrl);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Facebook OAuth callback
   */
  static async facebookCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code } = req.query;

      if (!code || typeof code !== 'string') {
        throw new ValidationError('Invalid authorization code');
      }

      const result = await AuthController.authService.handleFacebookCallback(code);

      // Redirect to frontend with tokens
      const redirectUrl = new URL(process.env.FRONTEND_URL || 'http://localhost:3001');
      redirectUrl.pathname = '/auth/callback';
      redirectUrl.searchParams.append('token', result.token);
      redirectUrl.searchParams.append('refreshToken', result.refreshToken);

      res.redirect(redirectUrl.toString());
    } catch (error) {
      // Redirect to frontend with error
      const redirectUrl = new URL(process.env.FRONTEND_URL || 'http://localhost:3001');
      redirectUrl.pathname = '/auth/error';
      redirectUrl.searchParams.append('error', 'authentication_failed');

      res.redirect(redirectUrl.toString());
    }
  }
}