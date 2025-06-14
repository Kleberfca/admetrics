import { logger } from './logger';

interface EnvValidationResult {
  isValid: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Validate required environment variables
 */
export function validateEnvironmentVariables(): EnvValidationResult {
  const required = [
    'NODE_ENV',
    'DATABASE_URL',
    'JWT_SECRET',
    'REDIS_HOST',
    'REDIS_PORT'
  ];

  const optional = [
    'PORT',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'FACEBOOK_APP_ID',
    'FACEBOOK_APP_SECRET',
    'SENTRY_DSN',
    'AI_ENGINE_URL'
  ];

  const missing: string[] = [];
  const warnings: string[] = [];

  // Check required variables
  for (const variable of required) {
    if (!process.env[variable]) {
      missing.push(variable);
    }
  }

  // Check optional variables
  for (const variable of optional) {
    if (!process.env[variable]) {
      warnings.push(variable);
    }
  }

  // Validate specific formats
  if (process.env.DATABASE_URL && !isValidDatabaseUrl(process.env.DATABASE_URL)) {
    missing.push('DATABASE_URL (invalid format)');
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    warnings.push('JWT_SECRET (should be at least 32 characters)');
  }

  if (process.env.NODE_ENV && !['development', 'test', 'production'].includes(process.env.NODE_ENV)) {
    warnings.push('NODE_ENV (should be development, test, or production)');
  }

  const isValid = missing.length === 0;

  if (!isValid) {
    logger.error('Missing required environment variables:', missing);
  }

  if (warnings.length > 0) {
    logger.warn('Optional environment variables not set:', warnings);
  }

  return {
    isValid,
    missing,
    warnings
  };
}

/**
 * Validate database URL format
 */
function isValidDatabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:';
  } catch {
    return false;
  }
}

/**
 * Get environment variable with fallback
 */
export function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  
  if (!value && !defaultValue) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  
  return value || defaultValue!;
}

/**
 * Get environment variable as number
 */
export function getEnvAsNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  
  if (!value) {
    if (defaultValue === undefined) {
      throw new Error(`Environment variable ${key} is not set`);
    }
    return defaultValue;
  }
  
  const parsed = parseInt(value, 10);
  
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} is not a valid number`);
  }
  
  return parsed;
}

/**
 * Get environment variable as boolean
 */
export function getEnvAsBoolean(key: string, defaultValue?: boolean): boolean {
  const value = process.env[key];
  
  if (!value) {
    if (defaultValue === undefined) {
      throw new Error(`Environment variable ${key} is not set`);
    }
    return defaultValue;
  }
  
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Get environment variable as array
 */
export function getEnvAsArray(key: string, separator: string = ',', defaultValue?: string[]): string[] {
  const value = process.env[key];
  
  if (!value) {
    if (!defaultValue) {
      throw new Error(`Environment variable ${key} is not set`);
    }
    return defaultValue;
  }
  
  return value.split(separator).map(item => item.trim()).filter(Boolean);
}