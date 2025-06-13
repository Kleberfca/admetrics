// backend/src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient, User } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    organizationId?: string;
  };
}

export interface JwtPayload {
  userId: string;
  iat?: number;
  exp?: number;
}

/**
 * Middleware to authenticate JWT tokens
 */
export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Access token required'
      });
      return;
    }

    // Verify JWT token
    const JWT_SECRET = process.env.JWT_SECRET!;
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        role: true,
        isEmailVerified: true,
        accountLockedUntil: true,
        organizationMembers: {
          select: {
            organizationId: true,
            role: true
          }
        }
      }
    });

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    // Check if account is locked
    if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
      res.status(423).json({
        success: false,
        message: 'Account is locked'
      });
      return;
    }

    // Add user info to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationMembers[0]?.organizationId
    };

    // Update last activity
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActivityAt: new Date() }
    });

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    } else if (error.name === 'JsonWebTokenError') {
      res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    } else {
      logger.error('Authentication error:', error);
      res.status(500).json({
        success: false,
        message: 'Authentication failed'
      });
    }
  }
};

/**
 * Middleware to authenticate API keys
 */
export const authenticateApiKey = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      res.status(401).json({
        success: false,
        message: 'API key required'
      });
      return;
    }

    // Find API key in database
    const apiKeys = await prisma.apiKey.findMany({
      where: {
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            accountLockedUntil: true
          }
        }
      }
    });

    // Check if any API key matches
    let matchedApiKey = null;
    for (const key of apiKeys) {
      const isMatch = await bcrypt.compare(apiKey, key.key);
      if (isMatch) {
        matchedApiKey = key;
        break;
      }
    }

    if (!matchedApiKey) {
      res.status(401).json({
        success: false,
        message: 'Invalid API key'
      });
      return;
    }

    // Check if user account is locked
    if (matchedApiKey.user.accountLockedUntil && matchedApiKey.user.accountLockedUntil > new Date()) {
      res.status(423).json({
        success: false,
        message: 'Account is locked'
      });
      return;
    }

    // Add user info to request
    req.user = {
      id: matchedApiKey.user.id,
      email: matchedApiKey.user.email,
      role: matchedApiKey.user.role
    };

    // Update API key last used timestamp
    await prisma.apiKey.update({
      where: { id: matchedApiKey.id },
      data: { lastUsedAt: new Date() }
    });

    next();
  } catch (error) {
    logger.error('API key authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

/**
 * Combined authentication middleware (JWT or API Key)
 */
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'] as string;

  if (authHeader) {
    // Use JWT authentication
    return authenticateToken(req, res, next);
  } else if (apiKey) {
    // Use API key authentication
    return authenticateApiKey(req, res, next);
  } else {
    res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
};

/**
 * Optional authentication - don't fail if no auth provided
 */
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'] as string;

  if (authHeader || apiKey) {
    return authenticate(req, res, next);
  } else {
    next();
  }
};

/**
 * Middleware to check user roles
 */
export const requireRole = (roles: string | string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to check if user owns resource or is admin
 */
export const requireOwnershipOrAdmin = (userIdParam: string = 'userId') => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    const resourceUserId = req.params[userIdParam] || req.body[userIdParam];
    
    if (req.user.role === 'ADMIN' || req.user.id === resourceUserId) {
      next();
    } else {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
  };
};

/**
 * Middleware to check organization membership
 */
export const requireOrganizationAccess = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    const organizationId = req.params.organizationId || req.body.organizationId;
    
    if (!organizationId) {
      res.status(400).json({
        success: false,
        message: 'Organization ID required'
      });
      return;
    }

    // Check if user is member of organization
    const membership = await prisma.organizationMember.findFirst({
      where: {
        userId: req.user.id,
        organizationId: organizationId
      }
    });

    if (!membership && req.user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Organization access denied'
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('Organization access check error:', error);
    res.status(500).json({
      success: false,
      message: 'Access check failed'
    });
  }
};

/**
 * Middleware to require email verification
 */
export const requireEmailVerification = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { isEmailVerified: true }
    });

    if (!user?.isEmailVerified) {
      res.status(403).json({
        success: false,
        message: 'Email verification required'
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('Email verification check error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification check failed'
    });
  }
};

/**
 * Middleware to check feature flags
 */
export const requireFeature = (featureName: string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const feature = await prisma.featureFlag.findUnique({
        where: { name: featureName }
      });

      if (!feature || !feature.isEnabled) {
        res.status(404).json({
          success: false,
          message: 'Feature not available'
        });
        return;
      }

      // Check rollout percentage if specified
      if (feature.rolloutPercentage < 100) {
        const userHash = req.user ? parseInt(req.user.id.slice(-4), 16) : Math.random() * 65536;
        const userPercentile = (userHash % 100) + 1;
        
        if (userPercentile > feature.rolloutPercentage) {
          res.status(404).json({
            success: false,
            message: 'Feature not available'
          });
          return;
        }
      }

      next();
    } catch (error) {
      logger.error('Feature flag check error:', error);
      res.status(500).json({
        success: false,
        message: 'Feature check failed'
      });
    }
  };
};

/**
 * Middleware to add CORS headers for authenticated routes
 */
export const addCorsHeaders = (req: Request, res: Response, next: NextFunction): void => {
  res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin,X-Requested-With,Content-Type,Accept,Authorization,x-api-key');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
};