import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Redis client configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  keyPrefix: process.env.REDIS_PREFIX || 'admetrics:',
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError: (err: Error) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // Only reconnect when the error contains "READONLY"
      return true;
    }
    return false;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true
};

// Create Redis client
export const redisClient = new Redis(redisConfig);

// Create separate client for pub/sub
export const redisPubClient = new Redis(redisConfig);
export const redisSubClient = new Redis(redisConfig);

// Handle Redis connection events
redisClient.on('connect', () => {
  logger.info('Redis client connected');
});

redisClient.on('ready', () => {
  logger.info('Redis client ready');
});

redisClient.on('error', (err) => {
  logger.error('Redis client error:', err);
});

redisClient.on('close', () => {
  logger.warn('Redis client connection closed');
});

redisClient.on('reconnecting', (delay: number) => {
  logger.info(`Redis client reconnecting in ${delay}ms`);
});

// Cache helpers
export class CacheManager {
  private static DEFAULT_TTL = 3600; // 1 hour

  /**
   * Get value from cache
   */
  static async get<T>(key: string): Promise<T | null> {
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  static async set(key: string, value: any, ttl?: number): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await redisClient.setex(key, ttl, serialized);
      } else {
        await redisClient.setex(key, this.DEFAULT_TTL, serialized);
      }
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  static async delete(key: string): Promise<boolean> {
    try {
      await redisClient.del(key);
      return true;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  /**
   * Delete multiple keys by pattern
   */
  static async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        return await redisClient.del(...keys);
      }
      return 0;
    } catch (error) {
      logger.error('Cache delete pattern error:', error);
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  static async exists(key: string): Promise<boolean> {
    try {
      const exists = await redisClient.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error('Cache exists error:', error);
      return false;
    }
  }

  /**
   * Get remaining TTL for a key
   */
  static async ttl(key: string): Promise<number> {
    try {
      return await redisClient.ttl(key);
    } catch (error) {
      logger.error('Cache TTL error:', error);
      return -1;
    }
  }

  /**
   * Increment counter
   */
  static async increment(key: string, amount: number = 1): Promise<number> {
    try {
      return await redisClient.incrby(key, amount);
    } catch (error) {
      logger.error('Cache increment error:', error);
      return 0;
    }
  }

  /**
   * Set hash field
   */
  static async hset(key: string, field: string, value: any): Promise<boolean> {
    try {
      await redisClient.hset(key, field, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('Cache hset error:', error);
      return false;
    }
  }

  /**
   * Get hash field
   */
  static async hget<T>(key: string, field: string): Promise<T | null> {
    try {
      const value = await redisClient.hget(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache hget error:', error);
      return null;
    }
  }

  /**
   * Get all hash fields
   */
  static async hgetall<T>(key: string): Promise<Record<string, T> | null> {
    try {
      const hash = await redisClient.hgetall(key);
      const result: Record<string, T> = {};
      
      for (const [field, value] of Object.entries(hash)) {
        result[field] = JSON.parse(value);
      }
      
      return Object.keys(result).length > 0 ? result : null;
    } catch (error) {
      logger.error('Cache hgetall error:', error);
      return null;
    }
  }
}

// Cache decorator
export function Cacheable(options: { key: string; ttl?: number } | ((target: any, propertyKey: string, ...args: any[]) => { key: string; ttl?: number })) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheOptions = typeof options === 'function' 
        ? options(target, propertyKey, ...args)
        : options;

      const cacheKey = cacheOptions.key;
      
      // Try to get from cache
      const cached = await CacheManager.get(cacheKey);
      if (cached !== null) {
        logger.debug(`Cache hit for key: ${cacheKey}`);
        return cached;
      }

      // Execute original method
      const result = await originalMethod.apply(this, args);

      // Store in cache
      await CacheManager.set(cacheKey, result, cacheOptions.ttl);
      logger.debug(`Cache set for key: ${cacheKey}`);

      return result;
    };

    return descriptor;
  };
}

// Export Redis manager for connection management
export const redisManager = {
  async connect(): Promise<void> {
    await redisClient.ping();
    logger.info('Redis connection established');
  },

  async disconnect(): Promise<void> {
    await redisClient.quit();
    await redisPubClient.quit();
    await redisSubClient.quit();
    logger.info('Redis connections closed');
  },

  isConnected(): boolean {
    return redisClient.status === 'ready';
  }
};