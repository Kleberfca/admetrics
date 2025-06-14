import axios from 'axios';
import { logger } from '../../utils/logger';

interface FacebookUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  picture?: string;
  verified: boolean;
}

export class FacebookAuthService {
  private appId: string;
  private appSecret: string;
  private redirectUri: string;
  private baseUrl = 'https://graph.facebook.com/v18.0';

  constructor() {
    this.appId = process.env.FACEBOOK_APP_ID!;
    this.appSecret = process.env.FACEBOOK_APP_SECRET!;
    this.redirectUri = process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:3000/api/auth/facebook/callback';
  }

  /**
   * Get Facebook OAuth URL
   */
  getAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      scope: 'email,public_profile',
      response_type: 'code',
      state: this.generateState()
    });

    return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
  }

  /**
   * Handle OAuth callback
   */
  async handleCallback(code: string): Promise<FacebookUser> {
    try {
      // Exchange code for access token
      const tokenResponse = await this.getAccessToken(code);
      const accessToken = tokenResponse.access_token;

      // Get user info
      const userInfo = await this.getUserInfo(accessToken);

      return {
        id: userInfo.id,
        email: userInfo.email,
        firstName: userInfo.first_name,
        lastName: userInfo.last_name,
        picture: userInfo.picture?.data?.url,
        verified: true
      };
    } catch (error) {
      logger.error('Facebook OAuth callback error', error);
      throw error;
    }
  }

  /**
   * Exchange code for access token
   */
  private async getAccessToken(code: string): Promise<any> {
    const params = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      redirect_uri: this.redirectUri,
      code
    });

    const response = await axios.get(
      `${this.baseUrl}/oauth/access_token?${params.toString()}`
    );

    return response.data;
  }

  /**
   * Get user info from Facebook
   */
  private async getUserInfo(accessToken: string): Promise<any> {
    const fields = 'id,email,first_name,last_name,picture.type(large)';
    
    const response = await axios.get(
      `${this.baseUrl}/me?fields=${fields}&access_token=${accessToken}`
    );

    return response.data;
  }

  /**
   * Generate state parameter for CSRF protection
   */
  private generateState(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', this.appSecret)
      .update(payload)
      .digest('hex');
    
    return `sha256=${expectedSignature}` === signature;
  }
}