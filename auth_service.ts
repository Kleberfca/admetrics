import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  type: 'email_verification' | 'password_reset';
}

interface RefreshTokenData {
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

export class AuthService {
  private prisma: PrismaClient;
  private redis: Redis;
  
  // Redis key prefixes
  private readonly REFRESH_TOKEN_PREFIX = 'refresh_token:';
  private readonly EMAIL_VERIFICATION_PREFIX = 'email_verification:';
  private readonly PASSWORD_RESET_PREFIX = 'password_reset:';
  private readonly RATE_LIMIT_PREFIX = 'auth_rate_limit:';

  // Token expiration times
  private readonly EMAIL_VERIFICATION_EXPIRY = 24 * 60 * 60; // 24 hours
  private readonly PASSWORD_RESET_EXPIRY = 60 * 60; // 1 hour
  private readonly REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60; // 30 days

  constructor(prisma: PrismaClient, redis: Redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  /**
   * Generate a secure email verification token
   */
  async generateEmailVerificationToken(userId: string): Promise<string> {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const key = `${this.EMAIL_VERIFICATION_PREFIX}${token}`;

      await this.redis.setex(key, this.EMAIL_VERIFICATION_EXPIRY, userId);

      logger.info('Email verification token generated', { userId });
      return token;
    } catch (error) {
      logger.error('Error generating email verification token:', error);
      throw new Error('Failed to generate verification token');
    }
  }

  /**
   * Verify email verification token
   */
  async verifyEmailVerificationToken(token: string): Promise<string | null> {
    try {
      const key = `${this.EMAIL_VERIFICATION_PREFIX}${token}`;
      const userId = await this.redis.get(key);

      if (!userId) {
        return null;
      }

      // Remove token after successful verification
      await this.redis.del(key);

      logger.info('Email verification token verified', { userId });
      return userId;
    } catch (error) {
      logger.error('Error verifying email verification token:', error);
      return null;
    }
  }

  /**
   * Generate a secure password reset token
   */
  async generatePasswordResetToken(userId: string): Promise<string> {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const key = `${this.PASSWORD_RESET_PREFIX}${token}`;

      await this.redis.setex(key, this.PASSWORD_RESET_EXPIRY, userId);

      logger.info('Password reset token generated', { userId });
      return token;
    } catch (error) {
      logger.error('Error generating password reset token:', error);
      throw new Error('Failed to generate reset token');
    }
  }

  /**
   * Verify password reset token
   */
  async verifyPasswordResetToken(token: string): Promise<string | null> {
    try {
      const key = `${this.PASSWORD_RESET_PREFIX}${token}`;
      const userId = await this.redis.get(key);

      if (!userId) {
        return null;
      }

      // Remove token after successful verification
      await this.redis.del(key);

      logger.info('Password reset token verified', { userId });
      return userId;
    } catch (error) {
      logger.error('Error verifying password reset token:', error);
      return null;
    }
  }

  /**
   * Store refresh token in Redis
   */
  async storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
    try {
      const key = `${this.REFRESH_TOKEN_PREFIX}${userId}:${refreshToken}`;
      const tokenData: RefreshTokenData = {
        token: refreshToken,
        userId,
        expiresAt: new Date(Date.now() + this.REFRESH_TOKEN_EXPIRY * 1000),
        createdAt: new Date(),
      };

      await this.redis.setex(
        key,
        this.REFRESH_TOKEN_EXPIRY,
        JSON.stringify(tokenData)
      );

      logger.info('Refresh token stored', { userId });
    } catch (error) {
      logger.error('Error storing refresh token:', error);
      throw new Error('Failed to store refresh token');
    }
  }

  /**
   * Validate refresh token
   */
  async validateRefreshToken(userId: string, refreshToken: string): Promise<boolean> {
    try {
      const key = `${this.REFRESH_TOKEN_PREFIX}${userId}:${refreshToken}`;
      const tokenData = await this.redis.get(key);

      if (!tokenData) {
        return false;
      }

      const parsedData: RefreshTokenData = JSON.parse(tokenData);
      
      // Check if token has expired
      if (new Date() > parsedData.expiresAt) {
        await this.redis.del(key);
        return false;
      }

      return parsedData.token === refreshToken && parsedData.userId === userId;
    } catch (error) {
      logger.error('Error validating refresh token:', error);
      return false;
    }
  }

  /**
   * Rotate refresh token (remove old, store new)
   */
  async rotateRefreshToken(
    userId: string,
    oldRefreshToken: string,
    newRefreshToken: string
  ): Promise<void> {
    try {
      const oldKey = `${this.REFRESH_TOKEN_PREFIX}${userId}:${oldRefreshToken}`;
      const newKey = `${this.REFRESH_TOKEN_PREFIX}${userId}:${newRefreshToken}`;

      // Remove old token
      await this.redis.del(oldKey);

      // Store new token
      const tokenData: RefreshTokenData = {
        token: newRefreshToken,
        userId,
        expiresAt: new Date(Date.now() + this.REFRESH_TOKEN_EXPIRY * 1000),
        createdAt: new Date(),
      };

      await this.redis.setex(
        newKey,
        this.REFRESH_TOKEN_EXPIRY,
        JSON.stringify(tokenData)
      );

      logger.info('Refresh token rotated', { userId });
    } catch (error) {
      logger.error('Error rotating refresh token:', error);
      throw new Error('Failed to rotate refresh token');
    }
  }

  /**
   * Revoke a specific refresh token
   */
  async revokeRefreshToken(userId: string, refreshToken: string): Promise<void> {
    try {
      const key = `${this.REFRESH_TOKEN_PREFIX}${userId}:${refreshToken}`;
      await this.redis.del(key);

      logger.info('Refresh token revoked', { userId });
    } catch (error) {
      logger.error('Error revoking refresh token:', error);
      throw new Error('Failed to revoke refresh token');
    }
  }

  /**
   * Revoke all refresh tokens for a user
   */
  async revokeAllRefreshTokens(userId: string): Promise<void> {
    try {
      const pattern = `${this.REFRESH_TOKEN_PREFIX}${userId}:*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);
      }

      logger.info('All refresh tokens revoked', { userId, count: keys.length });
    } catch (error) {
      logger.error('Error revoking all refresh tokens:', error);
      throw new Error('Failed to revoke refresh tokens');
    }
  }

  /**
   * Check rate limiting for authentication attempts
   */
  async checkRateLimit(
    identifier: string, // IP address or user ID
    action: string, // 'login', 'password_reset', etc.
    maxAttempts: number = 5,
    windowMs: number = 15 * 60 * 1000 // 15 minutes
  ): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
    try {
      const key = `${this.RATE_LIMIT_PREFIX}${action}:${identifier}`;
      const current = await this.redis.get(key);

      if (!current) {
        // First attempt
        await this.redis.setex(key, Math.ceil(windowMs / 1000), '1');
        return {
          allowed: true,
          remaining: maxAttempts - 1,
          resetTime: new Date(Date.now() + windowMs),
        };
      }

      const attempts = parseInt(current);
      
      if (attempts >= maxAttempts) {
        const ttl = await this.redis.ttl(key);
        return {
          allowed: false,
          remaining: 0,
          resetTime: new Date(Date.now() + ttl * 1000),
        };
      }

      // Increment attempts
      await this.redis.incr(key);
      const ttl = await this.redis.ttl(key);

      return {
        allowed: true,
        remaining: maxAttempts - attempts - 1,
        resetTime: new Date(Date.now() + ttl * 1000),
      };
    } catch (error) {
      logger.error('Error checking rate limit:', error);
      // Allow request if rate limiting fails
      return {
        allowed: true,
        remaining: maxAttempts,
        resetTime: new Date(Date.now() + windowMs),
      };
    }
  }

  /**
   * Reset rate limiting for an identifier
   */
  async resetRateLimit(identifier: string, action: string): Promise<void> {
    try {
      const key = `${this.RATE_LIMIT_PREFIX}${action}:${identifier}`;
      await this.redis.del(key);

      logger.info('Rate limit reset', { identifier, action });
    } catch (error) {
      logger.error('Error resetting rate limit:', error);
    }
  }

  /**
   * Get user sessions (active refresh tokens)
   */
  async getUserSessions(userId: string): Promise<RefreshTokenData[]> {
    try {
      const pattern = `${this.REFRESH_TOKEN_PREFIX}${userId}:*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length === 0) {
        return [];
      }

      const sessions: RefreshTokenData[] = [];

      for (const key of keys) {
        const tokenData = await this.redis.get(key);
        if (tokenData) {
          try {
            const parsedData: RefreshTokenData = JSON.parse(tokenData);
            
            // Check if session is still valid
            if (new Date() <= parsedData.expiresAt) {
              sessions.push(parsedData);
            } else {
              // Clean up expired session
              await this.redis.del(key);
            }
          } catch (parseError) {
            logger.error('Error parsing session data:', parseError);
            // Clean up corrupted data
            await this.redis.del(key);
          }
        }
      }

      return sessions;
    } catch (error) {
      logger.error('Error getting user sessions:', error);
      return [];
    }
  }

  /**
   * Clean up expired tokens
   */
  async cleanupExpiredTokens(): Promise<void> {
    try {
      const patterns = [
        `${this.EMAIL_VERIFICATION_PREFIX}*`,
        `${this.PASSWORD_RESET_PREFIX}*`,
        `${this.REFRESH_TOKEN_PREFIX}*`,
      ];

      let cleanedCount = 0;

      for (const pattern of patterns) {
        const keys = await this.redis.keys(pattern);
        
        for (const key of keys) {
          const ttl = await this.redis.ttl(key);
          
          // If TTL is -1, the key exists but has no expiry
          // If TTL is -2, the key doesn't exist
          if (ttl === -1) {
            await this.redis.del(key);
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        logger.info('Cleaned up expired tokens', { count: cleanedCount });
      }
    } catch (error) {
      logger.error('Error cleaning up expired tokens:', error);
    }
  }

  /**
   * Get authentication statistics
   */
  async getAuthStats(): Promise<{
    activeRefreshTokens: number;
    pendingEmailVerifications: number;
    pendingPasswordResets: number;
  }> {
    try {
      const [refreshTokens, emailVerifications, passwordResets] = await Promise.all([
        this.redis.keys(`${this.REFRESH_TOKEN_PREFIX}*`),
        this.redis.keys(`${this.EMAIL_VERIFICATION_PREFIX}*`),
        this.redis.keys(`${this.PASSWORD_RESET_PREFIX}*`),
      ]);

      return {
        activeRefreshTokens: refreshTokens.length,
        pendingEmailVerifications: emailVerifications.length,
        pendingPasswordResets: passwordResets.length,
      };
    } catch (error) {
      logger.error('Error getting auth stats:', error);
      return {
        activeRefreshTokens: 0,
        pendingEmailVerifications: 0,
        pendingPasswordResets: 0,
      };
    }
  }

  /**
   * Create or update user session tracking
   */
  async trackUserSession(
    userId: string,
    sessionData: {
      ip: string;
      userAgent: string;
      location?: string;
    }
  ): Promise<void> {
    try {
      const sessionKey = `user_session:${userId}`;
      const sessionInfo = {
        ...sessionData,
        lastActivity: new Date().toISOString(),
        loginCount: 1,
      };

      // Get existing session data
      const existingSession = await this.redis.get(sessionKey);
      if (existingSession) {
        const parsed = JSON.parse(existingSession);
        sessionInfo.loginCount = (parsed.loginCount || 0) + 1;
      }

      // Store session data for 7 days
      await this.redis.setex(
        sessionKey,
        7 * 24 * 60 * 60,
        JSON.stringify(sessionInfo)
      );

      logger.info('User session tracked', { userId });
    } catch (error) {
      logger.error('Error tracking user session:', error);
    }
  }

  /**
   * Get user session information
   */
  async getUserSessionInfo(userId: string): Promise<any> {
    try {
      const sessionKey = `user_session:${userId}`;
      const sessionData = await this.redis.get(sessionKey);

      if (!sessionData) {
        return null;
      }

      return JSON.parse(sessionData);
    } catch (error) {
      logger.error('Error getting user session info:', error);
      return null;
    }
  }

  /**
   * Validate user account status
   */
  async validateUserAccount(userId: string): Promise<{
    isValid: boolean;
    reason?: string;
    user?: any;
  }> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          isActive: true,
          emailVerified: true,
          role: true,
          createdAt: true,
          lastLoginAt: true,
        },
      });

      if (!user) {
        return { isValid: false, reason: 'User not found' };
      }

      if (!user.isActive) {
        return { isValid: false, reason: 'Account is disabled' };
      }

      return { isValid: true, user };
    } catch (error) {
      logger.error('Error validating user account:', error);
      return { isValid: false, reason: 'Validation error' };
    }
  }
}

export default AuthService;