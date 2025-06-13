// backend/src/config/redis.ts
import Redis, { RedisOptions } from 'ioredis';
import { logger } from '../utils/logger';

// Redis configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const REDIS_DB = parseInt(process.env.REDIS_DB || '0');
const NODE_ENV = process.env.NODE_ENV || 'development';

// Parse Redis URL
const parseRedisUrl = (url: string): RedisOptions => {
  try {
    const parsedUrl = new URL(url);
    return {
      host: parsedUrl.hostname,
      port: parseInt(parsedUrl.port) || 6379,
      password: parsedUrl.password || REDIS_PASSWORD,
      db: REDIS_DB,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      family: 4, // 4 (IPv4) or 6 (IPv6)
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000,
      retryDelayOnClusterDown: 300,
      retryTimer: 10000,
      maxRetriesPerRequest: 5
    };
  } catch (error) {
    logger.error('Invalid Redis URL:', error);
    throw new Error(`Invalid Redis URL: ${url}`);
  }
};

// Redis client configuration
const redisConfig: RedisOptions = {
  ...parseRedisUrl(REDIS_URL),
  // Cluster support
  enableReadyCheck: true,
  maxLoadingTimeout: 5000,
  
  // Connection pool
  enableOfflineQueue: false,
  
  // Reconnection strategy
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: NODE_ENV === 'production' ? 3 : 1,
  
  // Logging
  showFriendlyErrorStack: NODE_ENV === 'development'
};

// Create Redis instances
export const redis = new Redis(redisConfig);
export const redisSubscriber = new Redis(redisConfig);
export const redisPublisher = new Redis(redisConfig);

// Redis Manager
export class RedisManager {
  private static instance: RedisManager;
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
  private subscribers = new Map<string, Set<(message: any) => void>>();

  static getInstance(): RedisManager {
    if (!RedisManager.instance) {
      RedisManager.instance = new RedisManager();
    }
    return RedisManager.instance;
  }

  async connect(): Promise<void> {
    if (this.connectionStatus === 'connected') {
      return;
    }

    this.connectionStatus = 'connecting';

    try {
      // Setup event listeners
      this.setupEventListeners();

      // Connect to Redis
      await Promise.all([
        redis.connect(),
        redisSubscriber.connect(),
        redisPublisher.connect()
      ]);

      this.connectionStatus = 'connected';
      
      logger.info('Redis connected successfully', {
        host: redisConfig.host,
        port: redisConfig.port,
        db: redisConfig.db
      });

      // Test connection
      await redis.ping();
      
    } catch (error) {
      this.connectionStatus = 'error';
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await Promise.all([
        redis.disconnect(),
        redisSubscriber.disconnect(),
        redisPublisher.disconnect()
      ]);
      
      this.connectionStatus = 'disconnected';
      logger.info('Redis disconnected successfully');
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error);
      throw error;
    }
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    latency: number;
    details: any;
  }> {
    const start = Date.now();
    
    try {
      const result = await redis.ping();
      const latency = Date.now() - start;
      
      if (result === 'PONG') {
        const info = await redis.info('memory');
        const memoryUsage = this.parseRedisInfo(info);
        
        return {
          status: 'healthy',
          latency,
          details: {
            connection: this.connectionStatus,
            host: redisConfig.host,
            port: redisConfig.port,
            db: redisConfig.db,
            memory: memoryUsage
          }
        };
      } else {
        return {
          status: 'unhealthy',
          latency,
          details: { error: 'Ping failed' }
        };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: Date.now() - start,
        details: {
          error: error.message,
          connection: this.connectionStatus
        }
      };
    }
  }

  private setupEventListeners(): void {
    // Connection events
    redis.on('connect', () => {
      logger.info('Redis client connected');
    });

    redis.on('ready', () => {
      logger.info('Redis client ready');
    });

    redis.on('error', (error) => {
      logger.error('Redis client error:', error);
    });

    redis.on('close', () => {
      logger.warn('Redis client connection closed');
    });

    redis.on('reconnecting', (time) => {
      logger.info(`Redis client reconnecting in ${time}ms`);
    });

    redis.on('end', () => {
      logger.warn('Redis client connection ended');
    });

    // Subscriber events
    redisSubscriber.on('message', (channel, message) => {
      this.handleMessage(channel, message);
    });

    redisSubscriber.on('pmessage', (pattern, channel, message) => {
      this.handleMessage(channel, message, pattern);
    });

    // Handle process termination
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, closing Redis connections...');
      await this.disconnect();
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, closing Redis connections...');
      await this.disconnect();
    });
  }

  private handleMessage(channel: string, message: string, pattern?: string): void {
    try {
      const parsedMessage = JSON.parse(message);
      const callbacks = this.subscribers.get(channel);
      
      if (callbacks) {
        callbacks.forEach(callback => {
          try {
            callback(parsedMessage);
          } catch (error) {
            logger.error('Error in message callback:', error);
          }
        });
      }
    } catch (error) {
      logger.error('Error parsing Redis message:', error);
    }
  }

  private parseRedisInfo(info: string): any {
    const lines = info.split('\r\n');
    const result: any = {};
    
    lines.forEach(line => {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          result[key] = value;
        }
      }
    });
    
    return result;
  }

  // Pub/Sub methods
  async subscribe(channel: string, callback: (message: any) => void): Promise<void> {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
      await redisSubscriber.subscribe(channel);
    }
    
    this.subscribers.get(channel)!.add(callback);
  }

  async unsubscribe(channel: string, callback?: (message: any) => void): Promise<void> {
    const callbacks = this.subscribers.get(channel);
    
    if (callbacks) {
      if (callback) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscribers.delete(channel);
          await redisSubscriber.unsubscribe(channel);
        }
      } else {
        this.subscribers.delete(channel);
        await redisSubscriber.unsubscribe(channel);
      }
    }
  }

  async publish(channel: string, message: any): Promise<number> {
    const serialized = JSON.stringify(message);
    return await redisPublisher.publish(channel, serialized);
  }

  getConnectionStatus(): string {
    return this.connectionStatus;
  }
}

// Cache utilities
export class CacheUtils {
  /**
   * Set cache with TTL
   */
  static async set(
    key: string,
    value: any,
    ttl: number = 3600 // 1 hour default
  ): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      await redis.setex(key, ttl, serialized);
    } catch (error) {
      logger.error('Cache set error:', { key, error: error.message });
      throw error;
    }
  }

  /**
   * Get cached value
   */
  static async get<T = any>(key: string): Promise<T | null> {
    try {
      const cached = await redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.error('Cache get error:', { key, error: error.message });
      return null;
    }
  }

  /**
   * Delete cache key
   */
  static async del(key: string): Promise<number> {
    try {
      return await redis.del(key);
    } catch (error) {
      logger.error('Cache delete error:', { key, error: error.message });
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  static async exists(key: string): Promise<boolean> {
    try {
      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error:', { key, error: error.message });
      return false;
    }
  }

  /**
   * Set TTL for existing key
   */
  static async expire(key: string, ttl: number): Promise<boolean> {
    try {
      const result = await redis.expire(key, ttl);
      return result === 1;
    } catch (error) {
      logger.error('Cache expire error:', { key, error: error.message });
      return false;
    }
  }

  /**
   * Get TTL for key
   */
  static async ttl(key: string): Promise<number> {
    try {
      return await redis.ttl(key);
    } catch (error) {
      logger.error('Cache TTL error:', { key, error: error.message });
      return -1;
    }
  }

  /**
   * Increment counter
   */
  static async incr(key: string, by: number = 1): Promise<number> {
    try {
      return await redis.incrby(key, by);
    } catch (error) {
      logger.error('Cache increment error:', { key, error: error.message });
      throw error;
    }
  }

  /**
   * Set if not exists
   */
  static async setNX(key: string, value: any, ttl?: number): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      let result: string | null;
      
      if (ttl) {
        result = await redis.set(key, serialized, 'EX', ttl, 'NX');
      } else {
        result = await redis.set(key, serialized, 'NX');
      }
      
      return result === 'OK';
    } catch (error) {
      logger.error('Cache setNX error:', { key, error: error.message });
      return false;
    }
  }

  /**
   * Cache with function execution
   */
  static async remember<T>(
    key: string,
    ttl: number,
    fn: () => Promise<T>
  ): Promise<T> {
    const cached = await this.get<T>(key);
    
    if (cached !== null) {
      return cached;
    }

    const result = await fn();
    await this.set(key, result, ttl);
    
    return result;
  }

  /**
   * Invalidate cache by pattern
   */
  static async invalidatePattern(pattern: string): Promise<number> {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        return await redis.del(...keys);
      }
      return 0;
    } catch (error) {
      logger.error('Cache pattern invalidation error:', { pattern, error: error.message });
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  static async getStats(): Promise<{
    memory: string;
    keys: number;
    hits: number;
    misses: number;
    evictions: number;
  }> {
    try {
      const info = await redis.info('memory,stats');
      const parsed = redisManager.parseRedisInfo(info);
      
      return {
        memory: parsed.used_memory_human || '0B',
        keys: parseInt(parsed.db0?.split('keys=')[1]?.split(',')[0] || '0'),
        hits: parseInt(parsed.keyspace_hits || '0'),
        misses: parseInt(parsed.keyspace_misses || '0'),
        evictions: parseInt(parsed.evicted_keys || '0')
      };
    } catch (error) {
      logger.error('Cache stats error:', error);
      return {
        memory: '0B',
        keys: 0,
        hits: 0,
        misses: 0,
        evictions: 0
      };
    }
  }
}

// Rate limiting utilities
export class RateLimitUtils {
  /**
   * Token bucket rate limiter
   */
  static async checkRateLimit(
    key: string,
    limit: number,
    window: number
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }> {
    const now = Date.now();
    const windowStart = Math.floor(now / (window * 1000)) * (window * 1000);
    const windowKey = `ratelimit:${key}:${windowStart}`;

    try {
      const current = await redis.incr(windowKey);
      
      if (current === 1) {
        await redis.expire(windowKey, window);
      }

      const remaining = Math.max(0, limit - current);
      const resetTime = windowStart + (window * 1000);

      return {
        allowed: current <= limit,
        remaining,
        resetTime
      };
    } catch (error) {
      logger.error('Rate limit check error:', error);
      // Fail open - allow request if rate limiting fails
      return {
        allowed: true,
        remaining: limit,
        resetTime: now + (window * 1000)
      };
    }
  }

  /**
   * Sliding window rate limiter
   */
  static async checkSlidingWindow(
    key: string,
    limit: number,
    window: number
  ): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - (window * 1000);
    const windowKey = `sliding:${key}`;

    try {
      // Remove expired entries and add current request
      await redis
        .multi()
        .zremrangebyscore(windowKey, 0, windowStart)
        .zadd(windowKey, now, now)
        .zcount(windowKey, windowStart, now)
        .expire(windowKey, window)
        .exec();

      const count = await redis.zcard(windowKey);
      return count <= limit;
    } catch (error) {
      logger.error('Sliding window rate limit error:', error);
      return true; // Fail open
    }
  }
}

// Session management
export class SessionManager {
  private static sessionPrefix = 'session:';
  private static defaultTTL = 24 * 60 * 60; // 24 hours

  static async createSession(
    sessionId: string,
    data: any,
    ttl: number = this.defaultTTL
  ): Promise<void> {
    const key = `${this.sessionPrefix}${sessionId}`;
    await CacheUtils.set(key, data, ttl);
  }

  static async getSession<T = any>(sessionId: string): Promise<T | null> {
    const key = `${this.sessionPrefix}${sessionId}`;
    return await CacheUtils.get<T>(key);
  }

  static async updateSession(
    sessionId: string,
    data: any,
    ttl?: number
  ): Promise<void> {
    const key = `${this.sessionPrefix}${sessionId}`;
    const existing = await this.getSession(sessionId);
    
    if (existing) {
      const updated = { ...existing, ...data };
      const currentTTL = ttl || await CacheUtils.ttl(key);
      await CacheUtils.set(key, updated, currentTTL > 0 ? currentTTL : this.defaultTTL);
    }
  }

  static async destroySession(sessionId: string): Promise<void> {
    const key = `${this.sessionPrefix}${sessionId}`;
    await CacheUtils.del(key);
  }

  static async refreshSession(sessionId: string, ttl: number = this.defaultTTL): Promise<boolean> {
    const key = `${this.sessionPrefix}${sessionId}`;
    return await CacheUtils.expire(key, ttl);
  }
}

// Initialize Redis manager
export const redisManager = RedisManager.getInstance();

// Default export
export default redis;