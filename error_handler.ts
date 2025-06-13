import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
  details?: any;
}

export class CustomError extends Error implements AppError {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;
  public details?: any;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR', details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Main error handling middleware
 */
export const errorHandler = (
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Internal Server Error';
  let code = error.code || 'INTERNAL_ERROR';
  let details = error.details;

  // Log error details
  const errorLog = {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id,
    timestamp: new Date().toISOString(),
  };

  // Don't log validation errors and other client errors as errors
  if (statusCode >= 500) {
    logger.error('Server Error:', errorLog);
  } else {
    logger.warn('Client Error:', errorLog);
  }

  // Handle specific error types
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const prismaError = handlePrismaError(error);
    statusCode = prismaError.statusCode;
    message = prismaError.message;
    code = prismaError.code;
    details = prismaError.details;
  } else if (error instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    message = 'Invalid data provided';
    code = 'VALIDATION_ERROR';
    details = { originalError: error.message };
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
    code = 'INVALID_TOKEN';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
    code = 'TOKEN_EXPIRED';
  } else if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    code = 'VALIDATION_ERROR';
    details = parseValidationError(error);
  } else if (error.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
    code = 'INVALID_ID';
  } else if (error.name === 'MongoServerError' && (error as any).code === 11000) {
    statusCode = 409;
    message = 'Duplicate field value';
    code = 'DUPLICATE_FIELD';
  }

  // Handle specific HTTP status codes
  if (error.message === 'Not Found') {
    statusCode = 404;
    code = 'NOT_FOUND';
  }

  // Prepare error response
  const errorResponse: any = {
    success: false,
    message,
    error: code,
    timestamp: new Date().toISOString(),
  };

  // Add additional details in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = error.stack;
    errorResponse.details = details;
    
    if (req.body && Object.keys(req.body).length > 0) {
      errorResponse.requestBody = req.body;
    }
    
    if (req.query && Object.keys(req.query).length > 0) {
      errorResponse.requestQuery = req.query;
    }
  }

  // Add details if they exist and are relevant
  if (details && (statusCode < 500 || process.env.NODE_ENV === 'development')) {
    errorResponse.details = details;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
};

/**
 * Handle Prisma-specific errors
 */
function handlePrismaError(error: Prisma.PrismaClientKnownRequestError): {
  statusCode: number;
  message: string;
  code: string;
  details?: any;
} {
  switch (error.code) {
    case 'P2000':
      return {
        statusCode: 400,
        message: 'Value too long for the field',
        code: 'VALUE_TOO_LONG',
        details: { field: error.meta?.target }
      };
    
    case 'P2001':
      return {
        statusCode: 404,
        message: 'Record not found',
        code: 'RECORD_NOT_FOUND',
        details: { target: error.meta?.target }
      };
    
    case 'P2002':
      return {
        statusCode: 409,
        message: 'Record already exists',
        code: 'DUPLICATE_RECORD',
        details: { 
          field: error.meta?.target,
          constraint: 'unique_constraint'
        }
      };
    
    case 'P2003':
      return {
        statusCode: 400,
        message: 'Foreign key constraint failed',
        code: 'FOREIGN_KEY_CONSTRAINT',
        details: { field: error.meta?.field_name }
      };
    
    case 'P2004':
      return {
        statusCode: 400,
        message: 'Constraint failed on the database',
        code: 'CONSTRAINT_FAILED',
        details: error.meta
      };
    
    case 'P2005':
      return {
        statusCode: 400,
        message: 'Invalid field value',
        code: 'INVALID_FIELD_VALUE',
        details: { 
          field: error.meta?.field_name,
          value: error.meta?.field_value
        }
      };
    
    case 'P2006':
      return {
        statusCode: 400,
        message: 'Invalid value provided',
        code: 'INVALID_VALUE',
        details: error.meta
      };
    
    case 'P2007':
      return {
        statusCode: 400,
        message: 'Data validation error',
        code: 'DATA_VALIDATION_ERROR',
        details: error.meta
      };
    
    case 'P2008':
      return {
        statusCode: 400,
        message: 'Failed to parse the query',
        code: 'QUERY_PARSE_ERROR',
        details: { query_parsing_error: error.meta?.query_parsing_error }
      };
    
    case 'P2009':
      return {
        statusCode: 400,
        message: 'Failed to validate the query',
        code: 'QUERY_VALIDATION_ERROR',
        details: { query_validation_error: error.meta?.query_validation_error }
      };
    
    case 'P2010':
      return {
        statusCode: 500,
        message: 'Raw query failed',
        code: 'RAW_QUERY_FAILED',
        details: { message: error.meta?.message }
      };
    
    case 'P2011':
      return {
        statusCode: 400,
        message: 'Null constraint violation',
        code: 'NULL_CONSTRAINT_VIOLATION',
        details: { constraint: error.meta?.constraint }
      };
    
    case 'P2012':
      return {
        statusCode: 400,
        message: 'Missing required value',
        code: 'MISSING_REQUIRED_VALUE',
        details: { path: error.meta?.path }
      };
    
    case 'P2013':
      return {
        statusCode: 400,
        message: 'Missing required argument',
        code: 'MISSING_REQUIRED_ARGUMENT',
        details: { 
          argument: error.meta?.argument_name,
          field: error.meta?.field_name
        }
      };
    
    case 'P2014':
      return {
        statusCode: 400,
        message: 'Required relation is missing',
        code: 'REQUIRED_RELATION_MISSING',
        details: { relation: error.meta?.relation_name }
      };
    
    case 'P2015':
      return {
        statusCode: 404,
        message: 'Related record not found',
        code: 'RELATED_RECORD_NOT_FOUND',
        details: { details: error.meta?.details }
      };
    
    case 'P2016':
      return {
        statusCode: 400,
        message: 'Query interpretation error',
        code: 'QUERY_INTERPRETATION_ERROR',
        details: { details: error.meta?.details }
      };
    
    case 'P2017':
      return {
        statusCode: 400,
        message: 'Records for relation are not connected',
        code: 'RECORDS_NOT_CONNECTED',
        details: { 
          relation: error.meta?.relation_name,
          parent: error.meta?.parent_name,
          child: error.meta?.child_name
        }
      };
    
    case 'P2018':
      return {
        statusCode: 400,
        message: 'Required connected records not found',
        code: 'CONNECTED_RECORDS_NOT_FOUND',
        details: { details: error.meta?.details }
      };
    
    case 'P2019':
      return {
        statusCode: 400,
        message: 'Input error',
        code: 'INPUT_ERROR',
        details: { details: error.meta?.details }
      };
    
    case 'P2020':
      return {
        statusCode: 400,
        message: 'Value out of range',
        code: 'VALUE_OUT_OF_RANGE',
        details: { details: error.meta?.details }
      };
    
    case 'P2021':
      return {
        statusCode: 404,
        message: 'Table does not exist',
        code: 'TABLE_NOT_EXISTS',
        details: { table: error.meta?.table }
      };
    
    case 'P2022':
      return {
        statusCode: 404,
        message: 'Column does not exist',
        code: 'COLUMN_NOT_EXISTS',
        details: { column: error.meta?.column }
      };
    
    default:
      return {
        statusCode: 500,
        message: 'Database error occurred',
        code: 'DATABASE_ERROR',
        details: { 
          code: error.code,
          meta: error.meta 
        }
      };
  }
}

/**
 * Parse validation errors
 */
function parseValidationError(error: any): any {
  if (error.details) {
    return error.details.map((detail: any) => ({
      field: detail.path?.join('.'),
      message: detail.message,
      type: detail.type,
      value: detail.context?.value
    }));
  }
  
  if (error.errors) {
    return Object.keys(error.errors).map(field => ({
      field,
      message: error.errors[field].message,
      type: error.errors[field].kind,
      value: error.errors[field].value
    }));
  }
  
  return null;
}

/**
 * Async error wrapper - catches async errors and passes them to error handler
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 handler
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = new CustomError(
    `Route ${req.originalUrl} not found`,
    404,
    'NOT_FOUND',
    {
      method: req.method,
      path: req.path,
      query: req.query
    }
  );
  
  next(error);
};

/**
 * Validation error creator
 */
export const createValidationError = (message: string, field?: string): CustomError => {
  return new CustomError(
    message,
    400,
    'VALIDATION_ERROR',
    field ? { field } : undefined
  );
};

/**
 * Authorization error creator
 */
export const createAuthError = (message: string = 'Unauthorized'): CustomError => {
  return new CustomError(message, 401, 'UNAUTHORIZED');
};

/**
 * Forbidden error creator
 */
export const createForbiddenError = (message: string = 'Forbidden'): CustomError => {
  return new CustomError(message, 403, 'FORBIDDEN');
};

/**
 * Not found error creator
 */
export const createNotFoundError = (resource: string = 'Resource'): CustomError => {
  return new CustomError(`${resource} not found`, 404, 'NOT_FOUND');
};

/**
 * Conflict error creator
 */
export const createConflictError = (message: string): CustomError => {
  return new CustomError(message, 409, 'CONFLICT');
};

export default errorHandler;