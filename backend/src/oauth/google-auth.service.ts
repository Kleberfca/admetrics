import { OAuth2Client } from 'google-auth-library';
import { logger } from '../../utils/logger';

interface GoogleUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  picture?: string;
  verified: boolean;
}

export class GoogleAuthService {
  private client: OAuth2Client;
  private redirectUri: string;

  constructor() {
    this.client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback'
    );
    
    this.redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback';
  }

  /**
   * Get Google OAuth URL
   */
  getAuthUrl(): string {
    const scopes = [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ];

    return this.client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
  }

  /**
   * Handle OAuth callback
   */
  async handleCallback(code: string): Promise<GoogleUser> {
    try {
      const { tokens } = await this.client.getToken(code);
      this.client.setCredentials(tokens);

      // Get user info
      const ticket = await this.client.verifyIdToken({
        idToken: tokens.id_token!,
        audience: process.env.GOOGLE_CLIENT_ID!
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new Error('No payload returned from Google');
      }

      return {
        id: payload.sub,
        email: payload.email!,
        firstName: payload.given_name || payload.name?.split(' ')[0] || '',
        lastName: payload.family_name || payload.name?.split(' ')[1] || '',
        picture: payload.picture,
        verified: payload.email_verified || false
      };
    } catch (error) {
      logger.error('Google OAuth callback error', error);
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken: string): Promise<string> {
    try {
      this.client.setCredentials({
        refresh_token: refreshToken
      });

      const { credentials } = await this.client.refreshAccessToken();
      return credentials.access_token!;
    } catch (error) {
      logger.error('Google token refresh error', error);
      throw error;
    }
  }
}