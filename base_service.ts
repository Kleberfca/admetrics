// backend/src/services/base.service.ts
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';
import Redis from 'ioredis';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  retryAfterMs?: number;
}

export interface ServiceConfig {
  rateLimit?: RateLimitConfig;
  timeout?: number;
  retries?: number;
  cacheEnabled?: boolean;
  cacheTtl?: number;
}

export interface ServiceMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastRequestAt?: Date;
  errors: Array<{
    timestamp: Date;
    error: string;
    operation: string;
  }>;
}

export abstract class BaseService extends EventEmitter {
  protected config: ServiceConfig;
  protected metrics: ServiceMetrics;
  protected redis?: Redis;
  private requestQueue: Map<string, number[]> = new Map();

  constructor(config: ServiceConfig = {}) {
    super();
    this.config = {
      timeout: 30000,
      retries: 3,
      cacheEnabled: false,
      cacheTtl: 300, // 5 minutes
      ...config
    };

    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      errors: []
    };

    if (this.config.cacheEnabled) {
      this.initializeRedis();
    }
  }

  /**
   * Initialize Redis connection for caching
   */
  private async initializeRedis(): Promise<void> {
    try {
      this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
      this.redis.on('error', (error) => {
        logger.error('Redis connection error:', error);
      });
    } catch (error) {
      logger.warn('Failed to initialize Redis, caching disabled:', error);
      this.config.cacheEnabled = false;
    }
  }

  /**
   * Execute operation with rate limiting, retries, and metrics tracking
   */
  protected async executeWithPolicy<T>(
    operation: string,
    fn: () => Promise<T>,
    options?: { 
      skipRateLimit?: boolean;
      skipCache?: boolean;
      cacheKey?: string;
      cacheTtl?: number;
    }
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      // Check rate limits
      if (!options?.skipRateLimit && this.config.rateLimit) {
        await this.checkRateLimit(operation);
      }

      // Check cache first
      if (this.config.cacheEnabled && !options?.skipCache && options?.cacheKey) {
        const cached = await this.getFromCache(options.cacheKey);
        if (cached) {
          this.recordMetrics(operation, startTime, true);
          return cached;
        }
      }

      // Execute with retries
      const result = await this.executeWithRetries(fn, this.config.retries || 0);

      // Cache result
      if (this.config.cacheEnabled && !options?.skipCache && options?.cacheKey) {
        await this.setCache(
          options.cacheKey, 
          result, 
          options?.cacheTtl || this.config.cacheTtl!
        );
      }

      this.recordMetrics(operation, startTime, true);
      this.emit('operation_success', { operation, duration: Date.now() - startTime });

      return result;

    } catch (error) {
      this.recordMetrics(operation, startTime, false, error.message);
      this.emit('operation_error', { operation, error: error.message });
      throw error;
    }
  }

  /**
   * Execute function with retry logic
   */
  private async executeWithRetries<T>(
    fn: () => Promise<T>,
    retries: number,
    lastError?: Error
  ): Promise<T> {
    try {
      return await Promise.race([
        fn(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Operation timeout')), this.config.timeout)
        )
      ]);
    } catch (error) {
      if (retries > 0) {
        logger.warn(`Retrying operation, ${retries} retries left:`, error.message);
        await this.delay(Math.pow(2, this.config.retries! - retries) * 1000); // Exponential backoff
        return this.executeWithRetries(fn, retries - 1, error);
      }
      throw error;
    }
  }

  /**
   * Check rate limits for operation
   */
  private async checkRateLimit(operation: string): Promise<void> {
    if (!this.config.rateLimit) return;

    const now = Date.now();
    const windowStart = now - this.config.rateLimit.windowMs;
    
    // Get current requests in window
    const requests = this.requestQueue.get(operation) || [];
    const requestsInWindow = requests.filter(time => time > windowStart);
    
    if (requestsInWindow.length >= this.config.rateLimit.maxRequests) {
      const retryAfter = this.config.rateLimit.retryAfterMs || this.config.rateLimit.windowMs;
      throw new Error(`Rate limit exceeded for ${operation}. Retry after ${retryAfter}ms`);
    }

    // Add current request
    requestsInWindow.push(now);
    this.requestQueue.set(operation, requestsInWindow);
  }

  /**
   * Record operation metrics
   */
  private recordMetrics(
    operation: string, 
    startTime: number, 
    success: boolean, 
    errorMessage?: string
  ): void {
    const duration = Date.now() - startTime;
    
    this.metrics.totalRequests++;
    this.metrics.lastRequestAt = new Date();
    
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
      if (errorMessage) {
        this.metrics.errors.push({
          timestamp: new Date(),
          error: errorMessage,
          operation
        });
        
        // Keep only last 100 errors
        if (this.metrics.errors.length > 100) {
          this.metrics.errors = this.metrics.errors.slice(-100);
        }
      }
    }
    
    // Update average response time
    const totalTime = this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + duration;
    this.metrics.averageResponseTime = totalTime / this.metrics.totalRequests;
  }

  /**
   * Get data from cache
   */
  private async getFromCache<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;
    
    try {
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.warn('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set data in cache
   */
  private async setCache(key: string, value: any, ttl: number): Promise<void> {
    if (!this.redis) return;
    
    try {
      await this.redis.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      logger.warn('Cache set error:', error);
    }
  }

  /**
   * Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get service metrics
   */
  getMetrics(): ServiceMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset service metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      errors: []
    };
  }

  /**
   * Get service health status
   */
  getHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    errorRate: number;
    avgResponseTime: number;
    lastError?: string;
  } {
    const errorRate = this.metrics.totalRequests > 0 
      ? this.metrics.failedRequests / this.metrics.totalRequests 
      : 0;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (errorRate > 0.5 || this.metrics.averageResponseTime > 10000) {
      status = 'unhealthy';
    } else if (errorRate > 0.1 || this.metrics.averageResponseTime > 5000) {
      status = 'degraded';
    }

    return {
      status,
      uptime: process.uptime(),
      errorRate,
      avgResponseTime: this.metrics.averageResponseTime,
      lastError: this.metrics.errors.length > 0 
        ? this.metrics.errors[this.metrics.errors.length - 1].error 
        : undefined
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
    this.removeAllListeners();
  }

  /**
   * Abstract methods to be implemented by child services
   */
  abstract testConnection(): Promise<{ success: boolean; message: string }>;
}

/**
 * Platform service interface that all advertising platform services should implement
 */
export interface PlatformService {
  initialize(credentials: any): Promise<void>;
  testConnection(): Promise<{ success: boolean; message: string }>;
  getCampaigns(): Promise<any[]>;
  getCampaignById(id: string): Promise<any | null>;
  createCampaign(data: any): Promise<any>;
  updateCampaign(id: string, updates: any): Promise<any>;
  updateCampaignStatus(id: string, status: string): Promise<void>;
  deleteCampaign(id: string): Promise<void>;
  getCampaignMetrics(campaignIds: string[], startDate: Date, endDate: Date): Promise<any[]>;
  syncData(startDate: Date, endDate: Date): Promise<any>;
}

/**
 * Service factory for creating platform services
 */
export class ServiceFactory {
  private static services: Map<string, new () => PlatformService> = new Map();

  static register(platform: string, serviceClass: new () => PlatformService): void {
    this.services.set(platform, serviceClass);
  }

  static create(platform: string): PlatformService {
    const ServiceClass = this.services.get(platform);
    if (!ServiceClass) {
      throw new Error(`Service not found for platform: ${platform}`);
    }
    return new ServiceClass();
  }

  static getSupportedPlatforms(): string[] {
    return Array.from(this.services.keys());
  }
}