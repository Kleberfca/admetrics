// backend/src/config/api-keys.ts
import { logger } from '../utils/logger';
import { encryptCredentials, decryptCredentials } from '../utils/encryption';

export interface PlatformCredentials {
  platform: string;
  isRequired: boolean;
  fields: Array<{
    name: string;
    type: 'string' | 'password' | 'url' | 'number';
    label: string;
    description: string;
    required: boolean;
    validation?: {
      pattern?: string;
      minLength?: number;
      maxLength?: number;
    };
  }>;
}

export interface GoogleAdsConfig {
  clientId: string;
  clientSecret: string;
  developerToken: string;
  refreshToken?: string;
  customerId: string;
}

export interface FacebookAdsConfig {
  appId: string;
  appSecret: string;
  accessToken: string;
  accountId: string;
  businessId?: string;
}

export interface TikTokAdsConfig {
  appId: string;
  secret: string;
  accessToken: string;
  advertiserIds: string[];
}

export interface LinkedInAdsConfig {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken?: string;
  accounts: string[];
}

export interface TwitterAdsConfig {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
  accountId: string;
}

export interface YouTubeAdsConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId: string;
}

export interface PinterestAdsConfig {
  appId: string;
  appSecret: string;
  accessToken: string;
  refreshToken?: string;
  advertiserIds: string[];
}

export interface SnapchatAdsConfig {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken?: string;
  adAccountIds: string[];
}

// Platform credentials configuration
export const PLATFORM_CREDENTIALS: Record<string, PlatformCredentials> = {
  GOOGLE_ADS: {
    platform: 'Google Ads',
    isRequired: true,
    fields: [
      {
        name: 'clientId',
        type: 'string',
        label: 'Client ID',
        description: 'OAuth 2.0 Client ID from Google Cloud Console',
        required: true,
        validation: {
          pattern: '^\\d+-[a-zA-Z0-9_]+\\.apps\\.googleusercontent\\.com$',
          minLength: 20
        }
      },
      {
        name: 'clientSecret',
        type: 'password',
        label: 'Client Secret',
        description: 'OAuth 2.0 Client Secret from Google Cloud Console',
        required: true,
        validation: {
          minLength: 20
        }
      },
      {
        name: 'developerToken',
        type: 'password',
        label: 'Developer Token',
        description: 'Google Ads API Developer Token',
        required: true,
        validation: {
          pattern: '^[a-zA-Z0-9_-]{22}$'
        }
      },
      {
        name: 'customerId',
        type: 'string',
        label: 'Customer ID',
        description: 'Google Ads Customer ID (without dashes)',
        required: true,
        validation: {
          pattern: '^\\d{10}$'
        }
      },
      {
        name: 'refreshToken',
        type: 'password',
        label: 'Refresh Token',
        description: 'OAuth 2.0 Refresh Token (obtained during authorization)',
        required: false
      }
    ]
  },

  FACEBOOK_ADS: {
    platform: 'Facebook Ads',
    isRequired: true,
    fields: [
      {
        name: 'appId',
        type: 'string',
        label: 'App ID',
        description: 'Facebook App ID from developers.facebook.com',
        required: true,
        validation: {
          pattern: '^\\d{15,16}$'
        }
      },
      {
        name: 'appSecret',
        type: 'password',
        label: 'App Secret',
        description: 'Facebook App Secret',
        required: true,
        validation: {
          minLength: 32,
          maxLength: 32
        }
      },
      {
        name: 'accessToken',
        type: 'password',
        label: 'Access Token',
        description: 'Long-lived User Access Token or System User Token',
        required: true,
        validation: {
          minLength: 50
        }
      },
      {
        name: 'accountId',
        type: 'string',
        label: 'Ad Account ID',
        description: 'Facebook Ad Account ID (without act_ prefix)',
        required: true,
        validation: {
          pattern: '^\\d{15,16}$'
        }
      },
      {
        name: 'businessId',
        type: 'string',
        label: 'Business ID',
        description: 'Facebook Business Manager ID (optional)',
        required: false,
        validation: {
          pattern: '^\\d{15,16}$'
        }
      }
    ]
  },

  TIKTOK_ADS: {
    platform: 'TikTok Ads',
    isRequired: false,
    fields: [
      {
        name: 'appId',
        type: 'string',
        label: 'App ID',
        description: 'TikTok for Business App ID',
        required: true
      },
      {
        name: 'secret',
        type: 'password',
        label: 'App Secret',
        description: 'TikTok for Business App Secret',
        required: true
      },
      {
        name: 'accessToken',
        type: 'password',
        label: 'Access Token',
        description: 'TikTok Marketing API Access Token',
        required: true
      },
      {
        name: 'advertiserIds',
        type: 'string',
        label: 'Advertiser IDs',
        description: 'Comma-separated list of TikTok Advertiser IDs',
        required: true
      }
    ]
  },

  LINKEDIN_ADS: {
    platform: 'LinkedIn Ads',
    isRequired: false,
    fields: [
      {
        name: 'clientId',
        type: 'string',
        label: 'Client ID',
        description: 'LinkedIn App Client ID',
        required: true
      },
      {
        name: 'clientSecret',
        type: 'password',
        label: 'Client Secret',
        description: 'LinkedIn App Client Secret',
        required: true
      },
      {
        name: 'accessToken',
        type: 'password',
        label: 'Access Token',
        description: 'LinkedIn Marketing Developer Platform Access Token',
        required: true
      },
      {
        name: 'accounts',
        type: 'string',
        label: 'Ad Accounts',
        description: 'Comma-separated list of LinkedIn Ad Account IDs',
        required: true
      }
    ]
  },

  TWITTER_ADS: {
    platform: 'Twitter Ads',
    isRequired: false,
    fields: [
      {
        name: 'consumerKey',
        type: 'string',
        label: 'Consumer Key',
        description: 'Twitter App Consumer Key (API Key)',
        required: true
      },
      {
        name: 'consumerSecret',
        type: 'password',
        label: 'Consumer Secret',
        description: 'Twitter App Consumer Secret (API Secret)',
        required: true
      },
      {
        name: 'accessToken',
        type: 'password',
        label: 'Access Token',
        description: 'Twitter User Access Token',
        required: true
      },
      {
        name: 'accessTokenSecret',
        type: 'password',
        label: 'Access Token Secret',
        description: 'Twitter User Access Token Secret',
        required: true
      },
      {
        name: 'accountId',
        type: 'string',
        label: 'Ads Account ID',
        description: 'Twitter Ads Account ID',
        required: true
      }
    ]
  },

  YOUTUBE_ADS: {
    platform: 'YouTube Ads',
    isRequired: false,
    fields: [
      {
        name: 'clientId',
        type: 'string',
        label: 'Client ID',
        description: 'Google OAuth 2.0 Client ID for YouTube',
        required: true
      },
      {
        name: 'clientSecret',
        type: 'password',
        label: 'Client Secret',
        description: 'Google OAuth 2.0 Client Secret',
        required: true
      },
      {
        name: 'refreshToken',
        type: 'password',
        label: 'Refresh Token',
        description: 'OAuth 2.0 Refresh Token for YouTube API',
        required: true
      },
      {
        name: 'customerId',
        type: 'string',
        label: 'Customer ID',
        description: 'Google Ads Customer ID for YouTube campaigns',
        required: true
      }
    ]
  },

  PINTEREST_ADS: {
    platform: 'Pinterest Ads',
    isRequired: false,
    fields: [
      {
        name: 'appId',
        type: 'string',
        label: 'App ID',
        description: 'Pinterest App ID',
        required: true
      },
      {
        name: 'appSecret',
        type: 'password',
        label: 'App Secret',
        description: 'Pinterest App Secret',
        required: true
      },
      {
        name: 'accessToken',
        type: 'password',
        label: 'Access Token',
        description: 'Pinterest Marketing API Access Token',
        required: true
      },
      {
        name: 'advertiserIds',
        type: 'string',
        label: 'Advertiser IDs',
        description: 'Comma-separated list of Pinterest Advertiser IDs',
        required: true
      }
    ]
  },

  SNAPCHAT_ADS: {
    platform: 'Snapchat Ads',
    isRequired: false,
    fields: [
      {
        name: 'clientId',
        type: 'string',
        label: 'Client ID',
        description: 'Snapchat Marketing API Client ID',
        required: true
      },
      {
        name: 'clientSecret',
        type: 'password',
        label: 'Client Secret',
        description: 'Snapchat Marketing API Client Secret',
        required: true
      },
      {
        name: 'accessToken',
        type: 'password',
        label: 'Access Token',
        description: 'Snapchat Marketing API Access Token',
        required: true
      },
      {
        name: 'adAccountIds',
        type: 'string',
        label: 'Ad Account IDs',
        description: 'Comma-separated list of Snapchat Ad Account IDs',
        required: true
      }
    ]
  }
};

// API Key Management
export class ApiKeyManager {
  /**
   * Validate platform credentials
   */
  static validateCredentials(platform: string, credentials: any): {
    isValid: boolean;
    errors: string[];
  } {
    const config = PLATFORM_CREDENTIALS[platform];
    const errors: string[] = [];

    if (!config) {
      return {
        isValid: false,
        errors: [`Unsupported platform: ${platform}`]
      };
    }

    // Check required fields
    for (const field of config.fields) {
      if (field.required && !credentials[field.name]) {
        errors.push(`${field.label} is required`);
        continue;
      }

      const value = credentials[field.name];
      if (value) {
        // Validate field format
        if (field.validation) {
          if (field.validation.pattern) {
            const regex = new RegExp(field.validation.pattern);
            if (!regex.test(value)) {
              errors.push(`${field.label} format is invalid`);
            }
          }

          if (field.validation.minLength && value.length < field.validation.minLength) {
            errors.push(`${field.label} must be at least ${field.validation.minLength} characters`);
          }

          if (field.validation.maxLength && value.length > field.validation.maxLength) {
            errors.push(`${field.label} must be no more than ${field.validation.maxLength} characters`);
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Encrypt and store platform credentials
   */
  static encryptCredentials(credentials: any): string {
    try {
      return encryptCredentials(credentials);
    } catch (error) {
      logger.error('Failed to encrypt credentials:', error);
      throw new Error('Credential encryption failed');
    }
  }

  /**
   * Decrypt platform credentials
   */
  static decryptCredentials<T = any>(encryptedCredentials: string): T {
    try {
      return decryptCredentials<T>(encryptedCredentials);
    } catch (error) {
      logger.error('Failed to decrypt credentials:', error);
      throw new Error('Credential decryption failed');
    }
  }

  /**
   * Test platform credentials
   */
  static async testCredentials(platform: string, credentials: any): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      // Import platform service dynamically
      const { ServiceFactory } = await import('../services/base.service');
      
      const service = ServiceFactory.create(platform);
      await service.initialize(credentials);
      
      const result = await service.testConnection();
      
      logger.info(`Credential test for ${platform}:`, result);
      
      return result;
    } catch (error) {
      logger.error(`Credential test failed for ${platform}:`, error);
      return {
        success: false,
        message: `Connection test failed: ${error.message}`
      };
    }
  }

  /**
   * Get masked credentials for display
   */
  static maskCredentials(credentials: any): any {
    const masked = { ...credentials };
    
    Object.keys(masked).forEach(key => {
      if (typeof masked[key] === 'string') {
        if (key.toLowerCase().includes('secret') || 
            key.toLowerCase().includes('token') || 
            key.toLowerCase().includes('password')) {
          masked[key] = this.maskString(masked[key]);
        }
      }
    });
    
    return masked;
  }

  private static maskString(str: string): string {
    if (str.length <= 8) {
      return '*'.repeat(str.length);
    }
    
    const start = str.slice(0, 4);
    const end = str.slice(-4);
    const middle = '*'.repeat(str.length - 8);
    
    return `${start}${middle}${end}`;
  }

  /**
   * Generate OAuth URLs for platforms that support it
   */
  static generateOAuthUrl(platform: string, redirectUri: string, state?: string): string {
    const baseUrls: Record<string, string> = {
      GOOGLE_ADS: 'https://accounts.google.com/oauth2/auth',
      FACEBOOK_ADS: 'https://www.facebook.com/v18.0/dialog/oauth',
      LINKEDIN_ADS: 'https://www.linkedin.com/oauth/v2/authorization',
      PINTEREST_ADS: 'https://www.pinterest.com/oauth/',
      SNAPCHAT_ADS: 'https://accounts.snapchat.com/login/oauth2/authorize'
    };

    const scopes: Record<string, string> = {
      GOOGLE_ADS: 'https://www.googleapis.com/auth/adwords',
      FACEBOOK_ADS: 'ads_management,ads_read,business_management',
      LINKEDIN_ADS: 'r_ads,r_ads_reporting,rw_ads',
      PINTEREST_ADS: 'ads:read,ads:write',
      SNAPCHAT_ADS: 'snapchat-marketing-api'
    };

    const baseUrl = baseUrls[platform];
    const scope = scopes[platform];

    if (!baseUrl || !scope) {
      throw new Error(`OAuth not supported for platform: ${platform}`);
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env[`${platform}_CLIENT_ID`] || '',
      redirect_uri: redirectUri,
      scope,
      ...(state && { state })
    });

    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Get required scopes for platform
   */
  static getRequiredScopes(platform: string): string[] {
    const scopes: Record<string, string[]> = {
      GOOGLE_ADS: ['https://www.googleapis.com/auth/adwords'],
      FACEBOOK_ADS: ['ads_management', 'ads_read', 'business_management'],
      LINKEDIN_ADS: ['r_ads', 'r_ads_reporting', 'rw_ads'],
      PINTEREST_ADS: ['ads:read', 'ads:write'],
      SNAPCHAT_ADS: ['snapchat-marketing-api'],
      TIKTOK_ADS: ['advertiser_management', 'report_data', 'campaign_management'],
      TWITTER_ADS: ['ads_management'],
      YOUTUBE_ADS: ['https://www.googleapis.com/auth/youtube', 'https://www.googleapis.com/auth/adwords']
    };

    return scopes[platform] || [];
  }

  /**
   * Get platform documentation URLs
   */
  static getDocumentationUrls(platform: string): {
    setup: string;
    api: string;
    oauth?: string;
  } {
    const docs: Record<string, any> = {
      GOOGLE_ADS: {
        setup: 'https://developers.google.com/google-ads/api/docs/first-call/overview',
        api: 'https://developers.google.com/google-ads/api/docs',
        oauth: 'https://developers.google.com/google-ads/api/docs/oauth/overview'
      },
      FACEBOOK_ADS: {
        setup: 'https://developers.facebook.com/docs/marketing-api/getting-started',
        api: 'https://developers.facebook.com/docs/marketing-api',
        oauth: 'https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow'
      },
      TIKTOK_ADS: {
        setup: 'https://ads.tiktok.com/marketing_api/docs?id=1738373164380162',
        api: 'https://ads.tiktok.com/marketing_api/docs'
      },
      LINKEDIN_ADS: {
        setup: 'https://docs.microsoft.com/en-us/linkedin/marketing/getting-started',
        api: 'https://docs.microsoft.com/en-us/linkedin/marketing/',
        oauth: 'https://docs.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow'
      }
    };

    return docs[platform] || {
      setup: 'https://docs.admetrics.ai/integrations',
      api: 'https://docs.admetrics.ai/api'
    };
  }
}

// Export platform-specific types
export type AllPlatformConfigs = 
  | GoogleAdsConfig 
  | FacebookAdsConfig 
  | TikTokAdsConfig 
  | LinkedInAdsConfig 
  | TwitterAdsConfig 
  | YouTubeAdsConfig 
  | PinterestAdsConfig 
  | SnapchatAdsConfig;

// Environment validation
export const validateEnvironmentVariables = (): {
  isValid: boolean;
  missing: string[];
  warnings: string[];
} => {
  const required = [
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'ENCRYPTION_KEY',
    'DATABASE_URL'
  ];

  const optional = [
    'REDIS_URL',
    'EMAIL_USER',
    'EMAIL_PASS',
    'GOOGLE_ADS_CLIENT_ID',
    'FACEBOOK_APP_ID',
    'FRONTEND_URL'
  ];

  const missing = required.filter(key => !process.env[key]);
  const warnings = optional.filter(key => !process.env[key]);

  return {
    isValid: missing.length === 0,
    missing,
    warnings
  };
};

// Default export
export default ApiKeyManager;