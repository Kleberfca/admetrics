// backend/src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        organizationId?: string;
      };
    }
  }
}

interface JWTPayload {
  userId: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

/**
 * Authentication middleware
 * Verifies JWT token and adds user info to request
 */
export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please provide a valid authentication token'
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    let payload: JWTPayload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({
          success: false,
          error: 'Token expired',
          message: 'Your session has expired. Please login again.'
        });
        return;
      }

      if (error instanceof jwt.JsonWebTokenError) {
        res.status(401).json({
          success: false,
          error: 'Invalid token',
          message: 'Please provide a valid authentication token'
        });
        return;
      }

      throw error;
    }

    // Check if token type is access
    if (payload.type !== 'access') {
      res.status(401).json({
        success: false,
        error: 'Invalid token type',
        message: 'Please use an access token for authentication'
      });
      return;
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        organizations: {
          select: {
            organizationId: true,
            role: true,
            organization: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'User not found',
        message: 'The user associated with this token no longer exists'
      });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({
        success: false,
        error: 'Account disabled',
        message: 'Your account has been disabled. Please contact support.'
      });
      return;
    }

    // Add user info to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizations[0]?.organizationId // Default to first organization
    };

    next();

  } catch (error) {
    logger.error('Authentication middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication error',
      message: 'An error occurred during authentication'
    });
  }
};

/**
 * Optional authentication middleware
 * Adds user info to request if token is provided, but doesn't require it
 */
export const optionalAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  try {
    await authMiddleware(req, res, next);
  } catch (error) {
    // If optional auth fails, continue without user info
    next();
  }
};

/**
 * Role-based authorization middleware
 */
export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please login to access this resource'
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        message: 'You do not have permission to access this resource'
      });
      return;
    }

    next();
  };
};

/**
 * Organization membership middleware
 * Ensures user belongs to the specified organization
 */
export const requireOrganization = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please login to access this resource'
      });
      return;
    }

    const organizationId = req.params.organizationId || req.body.organizationId;
    
    if (!organizationId) {
      res.status(400).json({
        success: false,
        error: 'Organization ID required',
        message: 'Organization ID must be provided'
      });
      return;
    }

    // Check if user is member of the organization
    const membership = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: req.user.id,
          organizationId: organizationId
        }
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!membership) {
      res.status(403).json({
        success: false,
        error: 'Organization access denied',
        message: 'You do not have access to this organization'
      });
      return;
    }

    // Add organization info to request
    req.user.organizationId = organizationId;

    next();

  } catch (error) {
    logger.error('Organization middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authorization error',
      message: 'An error occurred during authorization'
    });
  }
};

/**
 * API key authentication middleware
 * For external integrations and webhooks
 */
export const apiKeyMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      res.status(401).json({
        success: false,
        error: 'API key required',
        message: 'Please provide a valid API key in the X-API-Key header'
      });
      return;
    }

    // Validate API key (you might want to create an ApiKey model)
    // For now, check against environment variable
    if (apiKey !== process.env.API_KEY) {
      res.status(401).json({
        success: false,
        error: 'Invalid API key',
        message: 'The provided API key is invalid'
      });
      return;
    }

    next();

  } catch (error) {
    logger.error('API key middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication error',
      message: 'An error occurred during API key validation'
    });
  }
};

/**
 * Rate limiting middleware for authentication endpoints
 */
export const authRateLimitMiddleware = (options: {
  windowMs: number;
  max: number;
  message?: string;
}) => {
  const attempts = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const windowMs = options.windowMs;
    const maxAttempts = options.max;

    // Clean up old entries
    for (const [ip, data] of attempts.entries()) {
      if (now > data.resetTime) {
        attempts.delete(ip);
      }
    }

    // Get or create entry for this IP
    let attempt = attempts.get(key);
    if (!attempt || now > attempt.resetTime) {
      attempt = {
        count: 0,
        resetTime: now + windowMs
      };
      attempts.set(key, attempt);
    }

    // Check if limit exceeded
    if (attempt.count >= maxAttempts) {
      const resetTime = Math.ceil((attempt.resetTime - now) / 1000);
      res.status(429).json({
        success: false,
        error: 'Too many attempts',
        message: options.message || `Too many attempts. Try again in ${resetTime} seconds.`,
        retryAfter: resetTime
      });
      return;
    }

    // Increment attempt count
    attempt.count++;

    next();
  };
};

export default authMiddleware;