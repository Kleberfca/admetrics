import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '../config/redis';
import { TooManyRequestsError } from './error.middleware';

// Default rate limiter
export const rateLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:api:'
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new TooManyRequestsError());
  }
});

// Strict rate limiter for auth endpoints
export const authRateLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:auth:'
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  skipSuccessfulRequests: true, // Don't count successful requests
  handler: (req, res, next) => {
    next(new TooManyRequestsError('Too many authentication attempts'));
  }
});

// AI endpoint rate limiter
export const aiRateLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:ai:'
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // Limit each user to 50 AI requests per hour
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise use IP
    return req.user?.id || req.ip;
  },
  handler: (req, res, next) => {
    next(new TooManyRequestsError('AI request limit exceeded'));
  }
});

// Export rate limiter
export const exportRateLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:export:'
  }),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each user to 10 exports per hour
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
  handler: (req, res, next) => {
    next(new TooManyRequestsError('Export limit exceeded'));
  }
});