// backend/src/middleware/rate-limit.middleware.ts
import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { logger } from '../utils/logger';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  statusCode?: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export const rateLimitMiddleware = (options: RateLimitOptions) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: {
      success: false,
      error: 'Too many requests',
      message: options.message || 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(options.windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    skipFailedRequests: options.skipFailedRequests || false,
    handler: (req: Request, res: Response) => {
      logger.warning(`Rate limit exceeded for IP: ${req.ip}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        url: req.originalUrl,
        method: req.method
      });

      res.status(options.statusCode || 429).json({
        success: false,
        error: 'Too many requests',
        message: options.message || 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(options.windowMs / 1000)
      });
    },
    onLimitReached: (req: Request, res: Response) => {
      logger.error(`Rate limit reached for IP: ${req.ip}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        url: req.originalUrl,
        method: req.method
      });
    }
  });
};

// Pre-configured rate limiters
export const authRateLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many authentication attempts, please try again later.'
});

export const apiRateLimit = rateLimitMiddleware({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per window
  message: 'API rate limit exceeded, please try again later.'
});

export const strictRateLimit = rateLimitMiddleware({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: 'Rate limit exceeded for this endpoint.'
});

// ---

// backend/src/middleware/validation.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { logger } from '../utils/logger';

interface ValidationOptions {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export const validate = (schemas: ValidationOptions) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }

      // Validate query parameters
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }

      // Validate route parameters
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        logger.warning('Validation error:', {
          url: req.originalUrl,
          method: req.method,
          errors: formattedErrors,
          userId: req.user?.id
        });

        return res.status(400).json({
          success: false,
          error: 'Validation error',
          message: 'Invalid request data',
          details: formattedErrors
        });
      }

      logger.error('Unexpected validation error:', error);
      next(error);
    }
  };
};

// Common validation schemas
import { z } from 'zod';

export const commonSchemas = {
  pagination: z.object({
    page: z.string().optional().transform(val => val ? parseInt(val) : 1),
    limit: z.string().optional().transform(val => val ? parseInt(val) : 20),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc')
  }),

  dateRange: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime()
  }),

  idParam: z.object({
    id: z.string().cuid()
  })
};

// ---

// backend/src/middleware/error.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log error
  logger.error('Error occurred:', {
    error: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    requestId: req.id
  });

  // Default error response
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Internal Server Error';
  let details: any = null;

  // Handle specific error types
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        statusCode = 409;
        message = 'Resource already exists';
        details = {
          field: error.meta?.target,
          code: error.code
        };
        break;
      case 'P2025':
        statusCode = 404;
        message = 'Resource not found';
        break;
      case 'P2003':
        statusCode = 400;
        message = 'Foreign key constraint failed';
        break;
      default:
        statusCode = 400;
        message = 'Database operation failed';
    }
  } else if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    statusCode = 500;
    message = 'Database error occurred';
  } else if (error instanceof Prisma.PrismaClientRustPanicError) {
    statusCode = 500;
    message = 'Database connection error';
  } else if (error instanceof Prisma.PrismaClientInitializationError) {
    statusCode = 500;
    message = 'Database initialization error';
  } else if (error instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    message = 'Invalid database query';
  }

  // Handle JWT errors
  if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // Handle validation errors
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
  }

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const errorResponse: any = {
    success: false,
    error: message,
    ...(isDevelopment && { 
      stack: error.stack,
      details: details || error 
    }),
    ...(req.id && { requestId: req.id }),
    timestamp: new Date().toISOString()
  };

  // Add details if available
  if (details) {
    errorResponse.details = details;
  }

  res.status(statusCode).json(errorResponse);
};

// Custom error classes
export class ValidationError extends Error {
  statusCode = 400;
  isOperational = true;

  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  statusCode = 404;
  isOperational = true;

  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  statusCode = 403;
  isOperational = true;

  constructor(message: string = 'Access forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends Error {
  statusCode = 409;
  isOperational = true;

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

// ---

// backend/src/middleware/security.middleware.ts
import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { logger } from '../utils/logger';

// Security headers middleware
export const securityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// IP whitelist middleware
export const ipWhitelistMiddleware = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (allowedIPs.includes(clientIP!)) {
      next();
    } else {
      logger.security('Blocked request from unauthorized IP', {
        ip: clientIP,
        url: req.originalUrl,
        method: req.method,
        userAgent: req.get('User-Agent')
      });
      
      res.status(403).json({
        success: false,
        error: 'Access forbidden',
        message: 'Your IP address is not authorized to access this resource'
      });
    }
  };
};

// Request logging middleware
export const requestLoggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  // Log request
  logger.http('Incoming request', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentLength: req.get('Content-Length'),
    userId: req.user?.id,
    requestId: req.id
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    logger.http('Request completed', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length'),
      userId: req.user?.id,
      requestId: req.id
    });
  });

  next();
};

// Request sanitization middleware
export const sanitizeMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Sanitize request body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }

  next();
};

function sanitizeObject(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const sanitized: any = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      let value = obj[key];

      // Remove potentially dangerous characters
      if (typeof value === 'string') {
        value = value
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
      } else if (typeof value === 'object' && value !== null) {
        value = sanitizeObject(value);
      }

      sanitized[key] = value;
    }
  }

  return sanitized;
}

// API versioning middleware
export const apiVersionMiddleware = (supportedVersions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const version = req.headers['api-version'] as string || '1.0';
    
    if (!supportedVersions.includes(version)) {
      return res.status(400).json({
        success: false,
        error: 'Unsupported API version',
        message: `API version ${version} is not supported. Supported versions: ${supportedVersions.join(', ')}`,
        supportedVersions
      });
    }

    req.apiVersion = version;
    next();
  };
};

// Extend Request interface
declare global {
  namespace Express {
    interface Request {
      apiVersion?: string;
    }
  }
}