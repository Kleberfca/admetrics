import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { generateToken, generateRefreshToken } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { rateLimitSensitive } from '../middleware/auth';
import { logger } from '../utils/logger';
import { sendEmail } from '../services/email.service';
import crypto from 'crypto';

const router = Router();
const prisma = new PrismaClient();

/**
 * @swagger
 * components:
 *   schemas:
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         password:
 *           type: string
 *           minLength: 6
 *     RegisterRequest:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - password
 *       properties:
 *         name:
 *           type: string
 *           minLength: 2
 *         email:
 *           type: string
 *           format: email
 *         password:
 *           type: string
 *           minLength: 6
 *     AuthResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         data:
 *           type: object
 *           properties:
 *             user:
 *               $ref: '#/components/schemas/User'
 *             token:
 *               type: string
 *             refreshToken:
 *               type: string
 */

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error
 *       409:
 *         description: User already exists
 */
router.post('/register', [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
], asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { name, email, password } = req.body;

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email }
  });

  if (existingUser) {
    return res.status(409).json({
      success: false,
      message: 'User with this email already exists'
    });
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Create user
  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      provider: 'local'
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      emailVerified: true,
      isActive: true,
      createdAt: true
    }
  });

  // Create session
  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      token: crypto.randomBytes(32).toString('hex'),
      userAgent: req.get('User-Agent') || '',
      ipAddress: req.ip,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    }
  });

  // Generate JWT tokens
  const tokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    sessionId: session.id
  };

  const token = generateToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  // Update session with refresh token
  await prisma.userSession.update({
    where: { id: session.id },
    data: { refreshToken }
  });

  // Send welcome email (async)
  sendEmail({
    to: email,
    subject: 'Welcome to AdMetrics!',
    template: 'welcome',
    data: { name }
  }).catch(error => {
    logger.error('Failed to send welcome email:', error);
  });

  logger.info(`New user registered: ${email}`);

  res.status(201).json({
    success: true,
    data: {
      user,
      token,
      refreshToken
    },
    message: 'User registered successfully'
  });
}));

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', [
  rateLimitSensitive,
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { email, password } = req.body;

  // Find user
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      password: true,
      role: true,
      emailVerified: true,
      isActive: true,
      createdAt: true
    }
  });

  if (!user || !user.password) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }

  // Check if user is active
  if (!user.isActive) {
    return res.status(401).json({
      success: false,
      message: 'Account is disabled'
    });
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  
  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }

  // Create session
  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      token: crypto.randomBytes(32).toString('hex'),
      userAgent: req.get('User-Agent') || '',
      ipAddress: req.ip,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    }
  });

  // Generate JWT tokens
  const tokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    sessionId: session.id
  };

  const token = generateToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  // Update session with refresh token
  await prisma.userSession.update({
    where: { id: session.id },
    data: { refreshToken }
  });

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });

  // Remove password from response
  const { password: _, ...userResponse } = user;

  logger.info(`User logged in: ${email}`);

  res.json({
    success: true,
    data: {
      user: userResponse,
      token,
      refreshToken
    },
    message: 'Login successful'
  });
}));

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: Invalid refresh token
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({
      success: false,
      message: 'Refresh token is required'
    });
  }

  try {
    // Verify refresh token
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!refreshSecret) {
      throw new Error('JWT_REFRESH_SECRET not configured');
    }

    const decoded = jwt.verify(refreshToken, refreshSecret) as any;

    // Find session
    const session = await prisma.userSession.findFirst({
      where: {
        id: decoded.sessionId,
        refreshToken,
        isValid: true,
        expiresAt: {
          gt: new Date()
        }
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true
          }
        }
      }
    });

    if (!session || !session.user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }

    // Generate new tokens
    const tokenPayload = {
      userId: session.user.id,
      email: session.user.email,
      role: session.user.role,
      sessionId: session.id
    };

    const newToken = generateToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    // Update session
    await prisma.userSession.update({
      where: { id: session.id },
      data: {
        refreshToken: newRefreshToken,
        updatedAt: new Date()
      }
    });

    res.json({
      success: true,
      data: {
        token: newToken,
        refreshToken: newRefreshToken
      }
    });

  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid refresh token'
    });
  }
}));

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *       401:
 *         description: Unauthorized
 */
router.post('/logout', asyncHandler(async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      
      // Invalidate session
      await prisma.userSession.updateMany({
        where: {
          id: decoded.sessionId,
          userId: decoded.userId
        },
        data: {
          isValid: false
        }
      });

      logger.info(`User logged out: ${decoded.email}`);
    } catch (error) {
      // Token might be invalid, but still return success
      logger.debug('Invalid token during logout:', error);
    }
  }

  res.json({
    success: true,
    message: 'Logout successful'
  });
}));

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Password reset email sent
 *       404:
 *         description: User not found
 */
router.post('/forgot-password', [
  rateLimitSensitive,
  body('email').isEmail().normalizeEmail()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid email',
      errors: errors.array()
    });
  }

  const { email } = req.body;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true }
  });

  // Always return success to prevent email enumeration
  if (!user) {
    return res.json({
      success: true,
      message: 'If an account with that email exists, we\'ve sent a password reset link'
    });
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Store reset token (you might want to create a separate table for this)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      preferences: {
        resetToken,
        resetTokenExpiry: resetTokenExpiry.toISOString()
      }
    }
  });

  // Send reset email
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  
  sendEmail({
    to: email,
    subject: 'Password Reset Request',
    template: 'password-reset',
    data: {
      name: user.name,
      resetUrl
    }
  }).catch(error => {
    logger.error('Failed to send password reset email:', error);
  });

  logger.info(`Password reset requested for: ${email}`);

  res.json({
    success: true,
    message: 'If an account with that email exists, we\'ve sent a password reset link'
  });
}));

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid or expired token
 */
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { token, password } = req.body;

  // Find user with valid reset token
  const user = await prisma.user.findFirst({
    where: {
      preferences: {
        path: ['resetToken'],
        equals: token
      }
    }
  });

  if (!user || !user.preferences) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or expired reset token'
    });
  }

  // Check token expiry
  const preferences = user.preferences as any;
  if (!preferences.resetTokenExpiry || new Date(preferences.resetTokenExpiry) < new Date()) {
    return res.status(400).json({
      success: false,
      message: 'Reset token has expired'
    });
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Update password and clear reset token
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      preferences: {
        ...preferences,
        resetToken: null,
        resetTokenExpiry: null
      }
    }
  });

  // Invalidate all existing sessions
  await prisma.userSession.updateMany({
    where: { userId: user.id },
    data: { isValid: false }
  });

  logger.info(`Password reset completed for user: ${user.email}`);

  res.json({
    success: true,
    message: 'Password reset successful'
  });
}));

/**
 * @swagger
 * /api/auth/verify-email:
 *   post:
 *     summary: Verify email address
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid verification token
 */
router.post('/verify-email', asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      success: false,
      message: 'Verification token is required'
    });
  }

  // Find user with verification token
  const user = await prisma.user.findFirst({
    where: {
      preferences: {
        path: ['emailVerificationToken'],
        equals: token
      }
    }
  });

  if (!user) {
    return res.status(400).json({
      success: false,
      message: 'Invalid verification token'
    });
  }

  // Update user as verified
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      preferences: {
        ...(user.preferences as any),
        emailVerificationToken: null
      }
    }
  });

  logger.info(`Email verified for user: ${user.email}`);

  res.json({
    success: true,
    message: 'Email verified successfully'
  });
}));

/**
 * @swagger
 * /api/auth/resend-verification:
 *   post:
 *     summary: Resend email verification
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Verification email sent
 *       401:
 *         description: Unauthorized
 */
router.post('/resend-verification', asyncHandler(async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true, emailVerified: true }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Update user with verification token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        preferences: {
          emailVerificationToken: verificationToken
        }
      }
    });

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    
    sendEmail({
      to: user.email,
      subject: 'Verify Your Email Address',
      template: 'email-verification',
      data: {
        name: user.name,
        verificationUrl
      }
    }).catch(error => {
      logger.error('Failed to send verification email:', error);
    });

    res.json({
      success: true,
      message: 'Verification email sent'
    });

  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
}));

export default router;