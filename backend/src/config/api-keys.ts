export interface PlatformCredentials {
  [key: string]: any;
}

export interface GoogleAdsCredentials extends PlatformCredentials {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId?: string;
}

export interface FacebookAdsCredentials extends PlatformCredentials {
  appId: string;
  appSecret: string;
  accessToken: string;
  accountId: string;
}

export interface TikTokAdsCredentials extends PlatformCredentials {
  appId: string;
  appSecret: string;
  accessToken: string;
  advertiserId: string;
}

export interface LinkedInAdsCredentials extends PlatformCredentials {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  accountId: string;
}

export interface TwitterAdsCredentials extends PlatformCredentials {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
  accountId: string;
}

export const API_ENDPOINTS = {
  GOOGLE_ADS: {
    base: 'https://googleads.googleapis.com',
    version: 'v15',
    oauth: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token'
  },
  FACEBOOK_ADS: {
    base: 'https://graph.facebook.com',
    version: 'v18.0',
    oauth: 'https://www.facebook.com/v18.0/dialog/oauth',
    token: 'https://graph.facebook.com/v18.0/oauth/access_token'
  },
  TIKTOK_ADS: {
    base: 'https://business-api.tiktok.com',
    version: 'v1.3',
    oauth: 'https://business-api.tiktok.com/portal/auth',
    token: 'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token'
  },
  LINKEDIN_ADS: {
    base: 'https://api.linkedin.com',
    version: 'v2',
    oauth: 'https://www.linkedin.com/oauth/v2/authorization',
    token: 'https://www.linkedin.com/oauth/v2/accessToken'
  },
  TWITTER_ADS: {
    base: 'https://ads-api.twitter.com',
    version: '12',
    oauth: 'https://api.twitter.com/oauth/request_token',
    token: 'https://api.twitter.com/oauth/access_token'
  },
  PINTEREST_ADS: {
    base: 'https://api.pinterest.com',
    version: 'v5',
    oauth: 'https://www.pinterest.com/oauth',
    token: 'https://api.pinterest.com/v5/oauth/token'
  }
};

export const RATE_LIMITS = {
  GOOGLE_ADS: {
    requestsPerDay: 15000,
    requestsPerSecond: 10
  },
  FACEBOOK_ADS: {
    requestsPerHour: 200,
    requestsPerSecond: 5
  },
  TIKTOK_ADS: {
    requestsPerDay: 10000,
    requestsPerSecond: 10
  },
  LINKEDIN_ADS: {
    requestsPerDay: 10000,
    requestsPerSecond: 5
  },
  TWITTER_ADS: {
    requestsPerWindow: 300, // 15 minutes
    requestsPerSecond: 3
  }
};

export const SCOPES = {
  GOOGLE_ADS: [
    'https://www.googleapis.com/auth/adwords'
  ],
  FACEBOOK_ADS: [
    'ads_management',
    'ads_read',
    'business_management',
    'pages_read_engagement'
  ],
  TIKTOK_ADS: [
    'advertiser.read',
    'campaign.read',
    'creative.read',
    'report.read'
  ],
  LINKEDIN_ADS: [
    'r_ads',
    'r_ads_reporting',
    'r_organization_admin'
  ],
  TWITTER_ADS: [
    'ads:read',
    'ads:write'
  ]
};

export const WEBHOOK_EVENTS = {
  FACEBOOK_ADS: [
    'ad_account_update',
    'campaign_update',
    'ad_set_update',
    'ad_update'
  ],
  TIKTOK_ADS: [
    'campaign.update',
    'adgroup.update',
    'creative.update'
  ]
};

export function validateCredentials(platform: string, credentials: PlatformCredentials): boolean {
  switch (platform) {
    case 'GOOGLE_ADS':
      const googleCreds = credentials as GoogleAdsCredentials;
      return !!(
        googleCreds.developerToken &&
        googleCreds.clientId &&
        googleCreds.clientSecret &&
        googleCreds.refreshToken
      );

    case 'FACEBOOK_ADS':
      const fbCreds = credentials as FacebookAdsCredentials;
      return !!(
        fbCreds.appId &&
        fbCreds.appSecret &&
        fbCreds.accessToken &&
        fbCreds.accountId
      );

    case 'TIKTOK_ADS':
      const tiktokCreds = credentials as TikTokAdsCredentials;
      return !!(
        tiktokCreds.appId &&
        tiktokCreds.appSecret &&
        tiktokCreds.accessToken &&
        tiktokCreds.advertiserId
      );

    case 'LINKEDIN_ADS':
      const linkedinCreds = credentials as LinkedInAdsCredentials;
      return !!(
        linkedinCreds.clientId &&
        linkedinCreds.clientSecret &&
        linkedinCreds.accessToken &&
        linkedinCreds.accountId
      );

    case 'TWITTER_ADS':
      const twitterCreds = credentials as TwitterAdsCredentials;
      return !!(
        twitterCreds.consumerKey &&
        twitterCreds.consumerSecret &&
        twitterCreds.accessToken &&
        twitterCreds.accessTokenSecret &&
        twitterCreds.accountId
      );

    default:
      return false;
  }
}