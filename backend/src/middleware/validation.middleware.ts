import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError, z } from 'zod';
import { logger } from '../utils/logger';

/**
 * Validation middleware using Zod schemas
 */
export const validate = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));

        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors
        });
        return;
      }

      logger.error('Validation error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal validation error'
      });
    }
  };
};

/**
 * Custom validation rules
 */
export const customValidators = {
  // Validate UUID
  isUUID: (value: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  },

  // Validate date range
  isValidDateRange: (startDate: string, endDate: string): boolean => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return start < end && start <= new Date();
  },

  // Validate platform
  isValidPlatform: (platform: string): boolean => {
    const validPlatforms = [
      'GOOGLE_ADS',
      'FACEBOOK_ADS',
      'INSTAGRAM_ADS',
      'TIKTOK_ADS',
      'LINKEDIN_ADS',
      'TWITTER_ADS',
      'YOUTUBE_ADS',
      'PINTEREST_ADS',
      'SNAPCHAT_ADS'
    ];
    return validPlatforms.includes(platform);
  },

  // Validate email
  isValidEmail: (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  // Validate strong password
  isStrongPassword: (password: string): boolean => {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special character
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(password);
  }
};

/**
 * Common validation schemas
 */
export const commonSchemas = {
  // Pagination
  pagination: z.object({
    page: z.string().optional().transform(val => val ? parseInt(val) : 1),
    limit: z.string().optional().transform(val => val ? parseInt(val) : 20)
  }),

  // Date range
  dateRange: z.object({
    startDate: z.string().datetime('Invalid start date format'),
    endDate: z.string().datetime('Invalid end date format')
  }).refine(data => {
    return new Date(data.startDate) <= new Date(data.endDate);
  }, {
    message: 'Start date must be before end date'
  }),

  // UUID parameter
  uuidParam: z.object({
    id: z.string().uuid('Invalid ID format')
  }),

  // Platform enum
  platform: z.enum([
    'GOOGLE_ADS',
    'FACEBOOK_ADS',
    'INSTAGRAM_ADS',
    'TIKTOK_ADS',
    'LINKEDIN_ADS',
    'TWITTER_ADS',
    'YOUTUBE_ADS',
    'PINTEREST_ADS',
    'SNAPCHAT_ADS'
  ])
};

/**
 * Sanitize input data
 */
export const sanitize = (data: any): any => {
  if (typeof data === 'string') {
    // Remove potential XSS attempts
    return data
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .trim();
  }

  if (Array.isArray(data)) {
    return data.map(sanitize);
  }

  if (data && typeof data === 'object') {
    const sanitized: any = {};
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        sanitized[key] = sanitize(data[key]);
      }
    }
    return sanitized;
  }

  return data;
};

/**
 * Middleware to sanitize request data
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);
  next();
};