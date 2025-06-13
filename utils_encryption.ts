// backend/src/utils/encryption.ts
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { logger } from './logger';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_ROUNDS = 12;

// Get encryption key from environment or generate one
const getEncryptionKey = (): Buffer => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }
  
  // If key is hex string, convert to buffer
  if (key.length === KEY_LENGTH * 2) {
    return Buffer.from(key, 'hex');
  }
  
  // If key is base64, convert to buffer
  if (key.length === Math.ceil(KEY_LENGTH * 4 / 3)) {
    return Buffer.from(key, 'base64');
  }
  
  // Hash the key to get consistent 32 bytes
  return crypto.createHash('sha256').update(key).digest();
};

// Generate a random encryption key
export const generateEncryptionKey = (): string => {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
};

/**
 * Encrypt sensitive data using AES-256-GCM
 */
export const encrypt = (text: string): string => {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipher(ALGORITHM, key);
    
    cipher.setAAD(Buffer.from('AdMetrics-Auth', 'utf8'));
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    // Combine iv + tag + encrypted data
    const result = iv.toString('hex') + tag.toString('hex') + encrypted;
    return result;
    
  } catch (error) {
    logger.error('Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
};

/**
 * Decrypt data encrypted with encrypt function
 */
export const decrypt = (encryptedData: string): string => {
  try {
    const key = getEncryptionKey();
    
    // Extract components from encrypted data
    const iv = Buffer.from(encryptedData.slice(0, IV_LENGTH * 2), 'hex');
    const tag = Buffer.from(encryptedData.slice(IV_LENGTH * 2, (IV_LENGTH + TAG_LENGTH) * 2), 'hex');
    const encrypted = encryptedData.slice((IV_LENGTH + TAG_LENGTH) * 2);
    
    const decipher = crypto.createDecipher(ALGORITHM, key);
    decipher.setAAD(Buffer.from('AdMetrics-Auth', 'utf8'));
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
    
  } catch (error) {
    logger.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
};

/**
 * Hash password using bcrypt
 */
export const hashPassword = async (password: string): Promise<string> => {
  try {
    return await bcrypt.hash(password, SALT_ROUNDS);
  } catch (error) {
    logger.error('Password hashing failed:', error);
    throw new Error('Failed to hash password');
  }
};

/**
 * Verify password against hash
 */
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    logger.error('Password verification failed:', error);
    return false;
  }
};

/**
 * Generate secure random token
 */
export const generateToken = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Generate secure random string with specific characters
 */
export const generateSecureString = (
  length: number = 32,
  charset: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
): string => {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset.charAt(crypto.randomInt(0, charset.length));
  }
  return result;
};

/**
 * Generate API key in a specific format
 */
export const generateApiKey = (prefix: string = 'ak'): string => {
  const timestamp = Date.now().toString(36);
  const random = generateSecureString(32, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
  return `${prefix}_${timestamp}_${random}`;
};

/**
 * Hash API key for storage
 */
export const hashApiKey = async (apiKey: string): Promise<string> => {
  return hashPassword(apiKey);
};

/**
 * Verify API key against hash
 */
export const verifyApiKey = async (apiKey: string, hash: string): Promise<boolean> => {
  return verifyPassword(apiKey, hash);
};

/**
 * Encrypt sensitive JSON data (like API credentials)
 */
export const encryptJSON = (data: any): string => {
  const jsonString = JSON.stringify(data);
  return encrypt(jsonString);
};

/**
 * Decrypt JSON data
 */
export const decryptJSON = <T = any>(encryptedData: string): T => {
  const jsonString = decrypt(encryptedData);
  return JSON.parse(jsonString);
};

/**
 * Create HMAC signature for data integrity
 */
export const createSignature = (data: string, secret?: string): string => {
  const signatureSecret = secret || process.env.SIGNATURE_SECRET || 'default-secret';
  return crypto.createHmac('sha256', signatureSecret).update(data).digest('hex');
};

/**
 * Verify HMAC signature
 */
export const verifySignature = (data: string, signature: string, secret?: string): boolean => {
  const expectedSignature = createSignature(data, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
};

/**
 * Generate secure random UUID v4
 */
export const generateUUID = (): string => {
  return crypto.randomUUID();
};

/**
 * Hash sensitive data for comparison (one-way)
 */
export const hashData = (data: string): string => {
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Create time-based one-time password (TOTP) secret
 */
export const generateTOTPSecret = (): string => {
  return generateSecureString(32, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567');
};

/**
 * Encrypt credentials for platform integrations
 */
export const encryptCredentials = (credentials: any): string => {
  try {
    // Add timestamp for credential rotation tracking
    const credentialsWithTimestamp = {
      ...credentials,
      encryptedAt: new Date().toISOString(),
      version: 1
    };
    
    return encryptJSON(credentialsWithTimestamp);
  } catch (error) {
    logger.error('Credential encryption failed:', error);
    throw new Error('Failed to encrypt credentials');
  }
};

/**
 * Decrypt credentials for platform integrations
 */
export const decryptCredentials = <T = any>(encryptedCredentials: string): T => {
  try {
    const decrypted = decryptJSON(encryptedCredentials);
    
    // Remove encryption metadata
    const { encryptedAt, version, ...credentials } = decrypted;
    
    return credentials as T;
  } catch (error) {
    logger.error('Credential decryption failed:', error);
    throw new Error('Failed to decrypt credentials');
  }
};

/**
 * Secure data masking for logging
 */
export const maskSensitiveData = (data: any, fieldsToMask: string[] = ['password', 'token', 'secret', 'key']): any => {
  if (typeof data !== 'object' || data === null) {
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => maskSensitiveData(item, fieldsToMask));
  }
  
  const masked = { ...data };
  
  Object.keys(masked).forEach(key => {
    if (fieldsToMask.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      masked[key] = '[MASKED]';
    } else if (typeof masked[key] === 'object') {
      masked[key] = maskSensitiveData(masked[key], fieldsToMask);
    }
  });
  
  return masked;
};

/**
 * Generate secure session ID
 */
export const generateSessionId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(16).toString('hex');
  return `${timestamp}-${random}`;
};

/**
 * Key derivation function for consistent key generation
 */
export const deriveKey = (password: string, salt: string, iterations: number = 100000): Buffer => {
  return crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, 'sha256');
};

/**
 * Validate encryption key strength
 */
export const validateKeyStrength = (key: string): boolean => {
  if (key.length < 32) return false;
  
  // Check for sufficient entropy
  const entropy = calculateEntropy(key);
  return entropy >= 4.0; // Minimum bits per character
};

/**
 * Calculate entropy of a string
 */
const calculateEntropy = (str: string): number => {
  const charFreq: Record<string, number> = {};
  
  for (const char of str) {
    charFreq[char] = (charFreq[char] || 0) + 1;
  }
  
  let entropy = 0;
  const length = str.length;
  
  for (const freq of Object.values(charFreq)) {
    const probability = freq / length;
    entropy -= probability * Math.log2(probability);
  }
  
  return entropy;
};

// Export utility functions for testing
export const testUtils = {
  calculateEntropy,
  validateKeyStrength,
  getEncryptionKey: () => getEncryptionKey().toString('hex')
};