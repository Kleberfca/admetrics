import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

// Custom error classes
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  errors: any[];

  constructor(message: string, errors: any[] = []) {
    super(message, 400);
    this.errors = errors;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Conflict') {
    super(message, 409);
  }
}

export class TooManyRequestsError extends AppError {
  retryAfter?: number;

  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message, 429);
    this.retryAfter = retryAfter;
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error') {
    super(message, 500);
  }
}

/**
 * Handle Prisma errors
 */
const handlePrismaError = (error: Prisma.PrismaClientKnownRequestError): AppError => {
  switch (error.code) {
    case 'P2002':
      // Unique constraint violation
      const field = error.meta?.target as string[];
      return new ConflictError(`${field?.[0] || 'Field'} already exists`);
    
    case 'P2025':
      // Record not found
      return new NotFoundError('Record not found');
    
    case 'P2003':
      // Foreign key constraint violation
      return new ValidationError('Invalid reference');
    
    case 'P2014':
      // Invalid ID
      return new ValidationError('Invalid ID provided');
    
    default:
      return new InternalServerError('Database error');
  }
};

/**
 * Handle Zod validation errors
 */
const handleZodError = (error: ZodError): ValidationError => {
  const errors = error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code
  }));

  return new ValidationError('Validation failed', errors);
};

/**
 * Error handler middleware
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let error = err;

  // Handle specific error types
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    error = handlePrismaError(err);
  } else if (err instanceof ZodError) {
    error = handleZodError(err);
  } else if (err.name === 'JsonWebTokenError') {
    error = new UnauthorizedError('Invalid token');
  } else if (err.name === 'TokenExpiredError') {
    error = new UnauthorizedError('Token expired');
  } else if (err.name === 'MulterError') {
    error = new ValidationError(`File upload error: ${err.message}`);
  }

  // Default to 500 if not an AppError
  if (!(error instanceof AppError)) {
    error = new InternalServerError(
      process.env.NODE_ENV === 'production' 
        ? 'Something went wrong' 
        : error.message
    );
  }

  const appError = error as AppError;

  // Log error
  logger.error('Error:', {
    message: appError.message,
    statusCode: appError.statusCode,
    stack: appError.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id
  });

  // Send error response
  const response: any = {
    success: false,
    message: appError.message
  };

  // Include additional error details in development
  if (process.env.NODE_ENV !== 'production') {
    response.stack = appError.stack;
  }

  // Include validation errors if present
  if (appError instanceof ValidationError && appError.errors) {
    response.errors = appError.errors;
  }

  // Include retry-after header for rate limit errors
  if (appError instanceof TooManyRequestsError && appError.retryAfter) {
    res.setHeader('Retry-After', appError.retryAfter);
  }

  res.status(appError.statusCode).json(response);
};

/**
 * Handle 404 errors
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
};

/**
 * Handle async errors
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};