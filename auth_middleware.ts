import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
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

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  organizationId?: string;
  sessionId: string;
  iat: number;
  exp: number;
}

/**
 * Main authentication middleware
 */
export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Access token is required',
        error: 'UNAUTHORIZED'
      });
      return;
    }

    // Verify JWT token
    const decoded = verifyToken(token);
    
    if (!decoded) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
        error: 'INVALID_TOKEN'
      });
      return;
    }

    // Check if user exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        organizations: {
          select: {
            organizationId: true,
            role: true,
          }
        }
      }
    });

    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        message: 'User not found or inactive',
        error: 'USER_INACTIVE'
      });
      return;
    }

    // Verify session is still valid
    const session = await prisma.userSession.findUnique({
      where: { 
        id: decoded.sessionId,
        isValid: true,
      }
    });

    if (!session || session.expiresAt < new Date()) {
      res.status(401).json({
        success: false,
        message: 'Session expired or invalid',
        error: 'SESSION_EXPIRED'
      });
      return;
    }

    // Update last activity
    await prisma.userSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() }
    });

    // Attach user info to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizations[0]?.organizationId
    };

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(401).json({
      success: false,
      message: 'Authentication failed',
      error: 'AUTH_ERROR'
    });
  }
};

/**
 * Role-based access control middleware
 */
export const requireRole = (roles: string | string[]) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'UNAUTHORIZED'
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        error: 'FORBIDDEN'
      });
      return;
    }

    next();
  };
};

/**
 * Organization access middleware
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
        message: 'Authentication required',
        error: 'UNAUTHORIZED'
      });
      return;
    }

    const organizationId = req.params.organizationId || req.body.organizationId || req.query.organizationId;
    
    if (!organizationId) {
      res.status(400).json({
        success: false,
        message: 'Organization ID is required',
        error: 'MISSING_ORGANIZATION_ID'
      });
      return;
    }

    // Check if user has access to the organization
    const membership = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: req.user.id,
          organizationId: organizationId as string
        }
      },
      include: {
        organization: true
      }
    });

    if (!membership) {
      res.status(403).json({
        success: false,
        message: 'Access denied to this organization',
        error: 'ORGANIZATION_ACCESS_DENIED'
      });
      return;
    }

    // Add organization info to request
    req.user.organizationId = organizationId as string;
    
    next();
  } catch (error) {
    logger.error('Organization access check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify organization access',
      error: 'ORGANIZATION_ACCESS_ERROR'
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token provided
 */
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);
    
    if (token) {
      const decoded = verifyToken(token);
      
      if (decoded) {
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
          }
        });

        if (user && user.isActive) {
          req.user = {
            id: user.id,
            email: user.email,
            role: user.role,
          };
        }
      }
    }

    next();
  } catch (error) {
    logger.debug('Optional auth failed:', error);
    next();
  }
};

/**
 * API key authentication for external integrations
 */
export const apiKeyAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      res.status(401).json({
        success: false,
        message: 'API key is required',
        error: 'API_KEY_REQUIRED'
      });
      return;
    }

    // In a real implementation, you'd validate the API key against a database
    // For now, we'll just check if it matches a pattern
    if (!apiKey.startsWith('ak_')) {
      res.status(401).json({
        success: false,
        message: 'Invalid API key format',
        error: 'INVALID_API_KEY'
      });
      return;
    }

    // TODO: Implement proper API key validation
    // const apiKeyRecord = await prisma.apiKey.findUnique({
    //   where: { key: apiKey, isActive: true }
    // });

    next();
  } catch (error) {
    logger.error('API key authentication error:', error);
    res.status(401).json({
      success: false,
      message: 'API key authentication failed',
      error: 'API_KEY_AUTH_ERROR'
    });
  }
};

/**
 * Rate limiting for sensitive operations
 */
export const rateLimitSensitive = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // This would typically use Redis to track requests
  // For now, we'll just proceed
  next();
};

/**
 * Helper functions
 */

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Also check for token in cookies for web clients
  const cookieToken = req.cookies?.token;
  if (cookieToken) {
    return cookieToken;
  }
  
  return null;
}

function verifyToken(token: string): JWTPayload | null {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }
    
    const decoded = jwt.verify(token, secret) as JWTPayload;
    return decoded;
  } catch (error) {
    logger.debug('Token verification failed:', error);
    return null;
  }
}

/**
 * Generate JWT token
 */
export const generateToken = (payload: Omit<JWTPayload, 'iat' | 'exp'>): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }
  
  return jwt.sign(payload, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    issuer: 'admetrics-api',
    audience: 'admetrics-app',
  });
};

/**
 * Generate refresh token
 */
export const generateRefreshToken = (payload: Omit<JWTPayload, 'iat' | 'exp'>): string => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET not configured');
  }
  
  return jwt.sign(payload, secret, {
    expiresIn: '7d',
    issuer: 'admetrics-api',
    audience: 'admetrics-app',
  });
};

export default authMiddleware;