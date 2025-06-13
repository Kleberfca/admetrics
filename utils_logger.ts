// backend/src/utils/logger.ts
import winston from 'winston';
import path from 'path';

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
  debug: 'white',
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Determine the environment
const isDevelopment = process.env.NODE_ENV === 'development';

// Define format for logs
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack, ...meta } = info;
    
    let logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    // Add stack trace for errors
    if (stack) {
      logMessage += `\n${stack}`;
    }
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      logMessage += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return logMessage;
  })
);

// Define console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack, ...meta } = info;
    
    let logMessage = `${timestamp} ${level}: ${message}`;
    
    if (stack) {
      logMessage += `\n${stack}`;
    }
    
    if (Object.keys(meta).length > 0) {
      logMessage += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return logMessage;
  })
);

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    level: isDevelopment ? 'debug' : 'info',
    format: isDevelopment ? consoleFormat : format,
  }),
  
  // Error log file
  new winston.transports.File({
    filename: path.join('logs', 'error.log'),
    level: 'error',
    format,
    maxsize: 10485760, // 10MB
    maxFiles: 5,
  }),
  
  // Combined log file
  new winston.transports.File({
    filename: path.join('logs', 'combined.log'),
    format,
    maxsize: 10485760, // 10MB
    maxFiles: 10,
  }),
];

// Add HTTP log file in production
if (!isDevelopment) {
  transports.push(
    new winston.transports.File({
      filename: path.join('logs', 'http.log'),
      level: 'http',
      format,
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    })
  );
}

// Create the logger
const logger = winston.createLogger({
  level: isDevelopment ? 'debug' : 'info',
  levels,
  format,
  transports,
  exitOnError: false,
});

// Add request logging middleware helper
export const logRequest = (req: any, res: any, responseTime?: number) => {
  const { method, url, headers, body, user, ip } = req;
  const { statusCode } = res;
  
  const logData = {
    method,
    url,
    statusCode,
    responseTime: responseTime ? `${responseTime}ms` : undefined,
    userAgent: headers['user-agent'],
    userId: user?.id,
    ip,
    requestId: headers['x-request-id'],
  };
  
  // Don't log sensitive data in production
  if (isDevelopment && body && Object.keys(body).length > 0) {
    // Filter out passwords and tokens
    const filteredBody = { ...body };
    if (filteredBody.password) filteredBody.password = '[FILTERED]';
    if (filteredBody.token) filteredBody.token = '[FILTERED]';
    if (filteredBody.refreshToken) filteredBody.refreshToken = '[FILTERED]';
    
    logData.body = filteredBody;
  }
  
  if (statusCode >= 400) {
    logger.warn('HTTP Request', logData);
  } else {
    logger.http('HTTP Request', logData);
  }
};

// Error logging helper
export const logError = (error: Error, context?: any) => {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    context,
  });
};

// Database query logging helper
export const logDatabaseQuery = (query: string, duration?: number, error?: Error) => {
  if (error) {
    logger.error('Database Query Failed', {
      query,
      duration: duration ? `${duration}ms` : undefined,
      error: error.message,
    });
  } else if (isDevelopment) {
    logger.debug('Database Query', {
      query,
      duration: duration ? `${duration}ms` : undefined,
    });
  }
};

// Performance logging helper
export const logPerformance = (operation: string, duration: number, metadata?: any) => {
  const level = duration > 5000 ? 'warn' : duration > 1000 ? 'info' : 'debug';
  
  logger.log(level, 'Performance Metric', {
    operation,
    duration: `${duration}ms`,
    ...metadata,
  });
};

// Security event logging
export const logSecurityEvent = (event: string, details: any) => {
  logger.warn('Security Event', {
    event,
    timestamp: new Date().toISOString(),
    ...details,
  });
};

// Business logic logging
export const logBusinessEvent = (event: string, details: any) => {
  logger.info('Business Event', {
    event,
    timestamp: new Date().toISOString(),
    ...details,
  });
};

// External API logging
export const logExternalAPI = (
  service: string,
  endpoint: string,
  method: string,
  statusCode: number,
  duration: number,
  error?: Error
) => {
  const logData = {
    service,
    endpoint,
    method,
    statusCode,
    duration: `${duration}ms`,
  };
  
  if (error) {
    logger.error('External API Error', {
      ...logData,
      error: error.message,
    });
  } else if (statusCode >= 400) {
    logger.warn('External API Warning', logData);
  } else {
    logger.info('External API Call', logData);
  }
};

// AI/ML logging
export const logAIOperation = (
  operation: string,
  model: string,
  duration: number,
  accuracy?: number,
  error?: Error
) => {
  const logData = {
    operation,
    model,
    duration: `${duration}ms`,
    accuracy: accuracy ? `${accuracy}%` : undefined,
  };
  
  if (error) {
    logger.error('AI Operation Failed', {
      ...logData,
      error: error.message,
    });
  } else {
    logger.info('AI Operation', logData);
  }
};

// Cache logging
export const logCacheOperation = (
  operation: 'hit' | 'miss' | 'set' | 'delete',
  key: string,
  duration?: number
) => {
  logger.debug('Cache Operation', {
    operation,
    key,
    duration: duration ? `${duration}ms` : undefined,
  });
};

// Metrics and monitoring
export const logMetric = (name: string, value: number, unit?: string, tags?: Record<string, string>) => {
  logger.info('Metric', {
    name,
    value,
    unit,
    tags,
    timestamp: new Date().toISOString(),
  });
};

// Structured logging for alerts
export const logAlert = (
  level: 'critical' | 'warning' | 'info',
  title: string,
  description: string,
  metadata?: any
) => {
  const logLevel = level === 'critical' ? 'error' : level === 'warning' ? 'warn' : 'info';
  
  logger.log(logLevel, 'Alert', {
    alertLevel: level,
    title,
    description,
    timestamp: new Date().toISOString(),
    ...metadata,
  });
};

// Export configured logger
export { logger };

// Export logger instance as default
export default logger;