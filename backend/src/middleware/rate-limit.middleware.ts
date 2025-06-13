import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';

// Rate limit configurations for different endpoints
const rateLimitConfigs = {
  // Authentication endpoints - more restrictive
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per window
    message: 'Too many authentication attempts, please try again later'
  },

  // API endpoints - standard limits
  api: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: 'Too many requests, please try again later'
  },

  // Metrics endpoints - higher limits for data-intensive operations
  metrics: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50, // 50 requests per window
    message: 'Too many metrics requests, please try again later'
  },

  // Reports endpoints - lower limits for resource-intensive operations
  reports: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 requests per window
    message: 'Too many report generation requests, please try again later'
  },

  // AI endpoints - very limited for expensive operations
  ai: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 requests per window
    message: 'Too many AI analysis requests, please try again later'
  }
};

/**
 * Create rate limiter with Redis store
 */
const createRateLimiter = (config: any, keyPrefix: string) => {
  return rateLimit({
    store: new RedisStore({
      client: redisClient,
      prefix: `rate-limit:${keyPrefix}:`
    }),
    windowMs: config.windowMs,
    max: config.max,
    message: config.message,
    standardHeaders: true,
    legacyHeaders: false,
    
    // Custom key generator - combine IP and user ID if authenticated
    keyGenerator: (req: Request): string => {
      if (req.user?.id) {
        return `${req.ip}-${req.user.id}`;
      }
      return req.ip || 'unknown';
    },

    // Custom handler for rate limit exceeded
    handler: (req: Request, res: Response) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userId: req.user?.id,
        endpoint: req.originalUrl,
        keyPrefix
      });

      res.status(429).json({
        success: false,
        message: config.message,
        retryAfter: res.getHeader('Retry-After')
      });
    },

    // Skip successful requests from rate limit count for authenticated users
    skip: (req: Request): boolean => {
      // Skip rate limiting for admin users
      if (req.user?.role === 'ADMIN') {
        return true;
      }
      
      // Skip for whitelisted IPs
      const whitelistedIPs = process.env.RATE_LIMIT_WHITELIST?.split(',') || [];
      if (req.ip && whitelistedIPs.includes(req.ip)) {
        return true;
      }

      return false;
    }
  });
};

// Create rate limiters for each configuration
export const rateLimiters = {
  auth: createRateLimiter(rateLimitConfigs.auth, 'auth'),
  api: createRateLimiter(rateLimitConfigs.api, 'api'),
  metrics: createRateLimiter(rateLimitConfigs.metrics, 'metrics'),
  reports: createRateLimiter(rateLimitConfigs.reports, 'reports'),
  ai: createRateLimiter(rateLimitConfigs.ai, 'ai')
};

/**
 * Dynamic rate limiter middleware
 */
export const rateLimiter = (type: keyof typeof rateLimiters = 'api') => {
  return rateLimiters[type] || rateLimiters.api;
};

/**
 * Custom rate limiter for specific user actions
 */
export const userActionRateLimiter = (action: string, maxAttempts: number, windowMinutes: number) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      next();
      return;
    }

    const key = `user-action:${req.user.id}:${action}`;
    const windowMs = windowMinutes * 60 * 1000;
    
    try {
      const attempts = await redisClient.incr(key);
      
      if (attempts === 1) {
        await redisClient.expire(key, Math.ceil(windowMs / 1000));
      }

      if (attempts > maxAttempts) {
        const ttl = await redisClient.ttl(key);
        
        res.status(429).json({
          success: false,
          message: `Too many ${action} attempts. Please try again later.`,
          retryAfter: ttl > 0 ? ttl : windowMinutes * 60
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('User action rate limiter error:', error);
      next(); // Continue on error
    }
  };
};

/**
 * IP-based rate limiter for non-authenticated endpoints
 */
export const ipRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per window per IP
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => req.ip || 'unknown'
});