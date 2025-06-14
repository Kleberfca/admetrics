import nodemailer, { Transporter } from 'nodemailer';
import { logger } from '../utils/logger';
import path from 'path';
import fs from 'fs/promises';

interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  template?: string;
  data?: Record<string, any>;
}

export class EmailService {
  private transporter: Transporter;
  private templateCache: Map<string, string> = new Map();

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  /**
   * Send email
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      let html = options.html;
      
      // Load template if specified
      if (options.template) {
        html = await this.loadTemplate(options.template, options.data);
      }

      const mailOptions = {
        from: process.env.EMAIL_FROM || 'noreply@admetrics.ai',
        to: options.to,
        subject: options.subject,
        html,
        text: options.text || this.stripHtml(html || '')
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      logger.info('Email sent successfully', {
        messageId: info.messageId,
        to: options.to,
        subject: options.subject
      });
    } catch (error) {
      logger.error('Failed to send email', {
        error,
        to: options.to,
        subject: options.subject
      });
      throw error;
    }
  }

  /**
   * Send verification email
   */
  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${token}`;
    
    await this.sendEmail({
      to: email,
      subject: 'Verify Your AdMetrics Account',
      template: 'verification',
      data: {
        verificationUrl,
        email
      }
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;
    
    await this.sendEmail({
      to: email,
      subject: 'Reset Your AdMetrics Password',
      template: 'password-reset',
      data: {
        resetUrl,
        email
      }
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(email: string, firstName: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: 'Welcome to AdMetrics AI Dashboard',
      template: 'welcome',
      data: {
        firstName,
        dashboardUrl: process.env.FRONTEND_URL
      }
    });
  }

  /**
   * Send password changed email
   */
  async sendPasswordChangedEmail(email: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: 'Your AdMetrics Password Has Been Changed',
      template: 'password-changed',
      data: {
        email,
        supportUrl: `${process.env.FRONTEND_URL}/support`
      }
    });
  }

  /**
   * Send campaign alert email
   */
  async sendCampaignAlertEmail(
    email: string,
    campaignName: string,
    alertType: string,
    message: string
  ): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: `Campaign Alert: ${campaignName}`,
      template: 'campaign-alert',
      data: {
        campaignName,
        alertType,
        message,
        dashboardUrl: process.env.FRONTEND_URL
      }
    });
  }

  /**
   * Load email template
   */
  private async loadTemplate(templateName: string, data?: Record<string, any>): Promise<string> {
    try {
      // Check cache first
      let template = this.templateCache.get(templateName);
      
      if (!template) {
        const templatePath = path.join(__dirname, '..', 'templates', 'emails', `${templateName}.html`);
        template = await fs.readFile(templatePath, 'utf-8');
        this.templateCache.set(templateName, template);
      }

      // Replace placeholders with data
      if (data) {
        Object.entries(data).forEach(([key, value]) => {
          const regex = new RegExp(`{{${key}}}`, 'g');
          template = template!.replace(regex, value);
        });
      }

      return template;
    } catch (error) {
      logger.error('Failed to load email template', { templateName, error });
      throw error;
    }
  }

  /**
   * Strip HTML tags from content
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '');
  }
}

/**
 * Verify email service connection
 */
export async function verifyEmailConnection(): Promise<void> {
  try {
    const emailService = new EmailService();
    await emailService.transporter.verify();
    logger.info('Email service connection verified');
  } catch (error) {
    logger.error('Email service connection failed', error);
    throw error;
  }
}