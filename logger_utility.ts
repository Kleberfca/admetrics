// backend/src/utils/logger.ts
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
mkdir(logsDir, { recursive: true }).catch(() => {});

// Custom format for log messages
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, service, userId, requestId, ...meta }) => {
    let logMessage = `[${timestamp}] ${level.toUpperCase()}`;
    
    if (service) logMessage += ` [${service}]`;
    if (requestId) logMessage += ` [${requestId}]`;
    if (userId) logMessage += ` [User:${userId}]`;
    
    logMessage += `: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      logMessage += ` ${JSON.stringify(meta)}`;
    }
    
    return logMessage;
  })
);

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format: customFormat,
  defaultMeta: {
    service: 'admetrics-api'
  },
  transports: [
    // Error log file
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: process.env.LOG_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_MAX_FILES || '14d',
      zippedArchive: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),

    // Combined log file
    new DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: process.env.LOG_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_MAX_FILES || '14d',
      zippedArchive: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),

    // HTTP requests log
    new DailyRotateFile({
      filename: path.join(logsDir, 'http-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'http',
      maxSize: process.env.LOG_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_MAX_FILES || '7d',
      zippedArchive: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ],
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(logsDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: process.env.LOG_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_MAX_FILES || '14d',
      zippedArchive: true
    })
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(logsDir, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: process.env.LOG_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_MAX_FILES || '14d',
      zippedArchive: true
    })
  ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize({ all: true }),
      winston.format.simple(),
      winston.format.printf(({ timestamp, level, message, service, userId, requestId, ...meta }) => {
        let logMessage = `[${timestamp}] ${level}`;
        
        if (service) logMessage += ` [${service}]`;
        if (requestId) logMessage += ` [${requestId}]`;
        if (userId) logMessage += ` [User:${userId}]`;
        
        logMessage += `: ${message}`;
        
        // Add metadata if present (excluding common fields)
        const metaFields = Object.keys(meta).filter(key => 
          !['timestamp', 'level', 'message', 'service', 'userId', 'requestId'].includes(key)
        );
        
        if (metaFields.length > 0) {
          const cleanMeta = metaFields.reduce((acc, key) => {
            acc[key] = meta[key];
            return acc;
          }, {} as any);
          logMessage += ` ${JSON.stringify(cleanMeta, null, 2)}`;
        }
        
        return logMessage;
      })
    )
  }));
}

// Helper functions for structured logging
export const loggerHelpers = {
  /**
   * Log HTTP request
   */
  logRequest: (req: any, res: any, responseTime?: number) => {
    logger.http('HTTP Request', {
      method: req.method,
      url: req.originalUrl || req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      userId: req.user?.id,
      requestId: req.id,
      statusCode: res.statusCode,
      responseTime: responseTime ? `${responseTime}ms` : undefined,
      contentLength: res.get('Content-Length')
    });
  },

  /**
   * Log database query
   */
  logQuery: (query: string, params?: any[], duration?: number) => {
    logger.debug('Database Query', {
      query: query.length > 200 ? query.substring(0, 200) + '...' : query,
      params: params?.length ? params.map(p => typeof p === 'string' && p.length > 50 ? p.substring(0, 50) + '...' : p) : undefined,
      duration: duration ? `${duration}ms` : undefined
    });
  },

  /**
   * Log external API call
   */
  logApiCall: (service: string, endpoint: string, method: string, status?: number, duration?: number, error?: any) => {
    const level = error ? 'error' : status && status >= 400 ? 'warn' : 'info';
    
    logger.log(level, `External API Call - ${service}`, {
      service,
      endpoint,
      method,
      status,
      duration: duration ? `${duration}ms` : undefined,
      error: error?.message || error
    });
  },

  /**
   * Log AI model operation
   */
  logAIOperation: (operation: string, model: string, duration?: number, accuracy?: number, error?: any) => {
    const level = error ? 'error' : 'info';
    
    logger.log(level, `AI Operation - ${operation}`, {
      operation,
      model,
      duration: duration ? `${duration}ms` : undefined,
      accuracy: accuracy ? `${(accuracy * 100).toFixed(2)}%` : undefined,
      error: error?.message || error
    });
  },

  /**
   * Log security event
   */
  logSecurity: (event: string, details: any, severity: 'low' | 'medium' | 'high' | 'critical' = 'medium') => {
    const level = severity === 'critical' ? 'error' : severity === 'high' ? 'warn' : 'info';
    
    logger.log(level, `Security Event - ${event}`, {
      event,
      severity,
      ...details
    });
  },

  /**
   * Log business event
   */
  logBusiness: (event: string, details: any) => {
    logger.info(`Business Event - ${event}`, {
      event,
      ...details
    });
  },

  /**
   * Log performance metric
   */
  logPerformance: (metric: string, value: number, unit: string, context?: any) => {
    logger.info(`Performance Metric - ${metric}`, {
      metric,
      value,
      unit,
      ...context
    });
  }
};

// Create child logger with additional context
export const createChildLogger = (context: any) => {
  return logger.child(context);
};

// Performance monitoring middleware
export const performanceLogger = (label: string) => {
  const start = Date.now();
  
  return {
    end: (additionalData?: any) => {
      const duration = Date.now() - start;
      loggerHelpers.logPerformance(label, duration, 'ms', additionalData);
      return duration;
    }
  };
};

// Async function wrapper with automatic error logging
export const withErrorLogging = <T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  context?: string
) => {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      logger.error(`Error in ${context || fn.name}:`, {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        args: args.length > 0 ? args : undefined
      });
      throw error;
    }
  };
};

// Log application startup
export const logStartup = (config: any) => {
  logger.info('Application Starting', {
    nodeVersion: process.version,
    environment: process.env.NODE_ENV,
    port: config.port,
    database: config.database ? 'Connected' : 'Disconnected',
    redis: config.redis ? 'Connected' : 'Disconnected',
    aiEngine: config.aiEngine ? 'Connected' : 'Disconnected'
  });
};

// Log application shutdown
export const logShutdown = (reason?: string) => {
  logger.info('Application Shutting Down', {
    reason: reason || 'Normal shutdown',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
};

// Export the main logger
export { logger };
export default logger;