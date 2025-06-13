// backend/src/utils/email.ts
import nodemailer from 'nodemailer';
import handlebars from 'handlebars';
import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger';

export interface EmailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  template?: string;
  context?: any;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  priority?: 'high' | 'normal' | 'low';
  replyTo?: string;
}

export interface EmailTemplate {
  name: string;
  subject: string;
  html: string;
  text?: string;
}

interface EmailConfig {
  service: string;
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
  replyTo?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter;
  private config: EmailConfig;
  private templateCache = new Map<string, EmailTemplate>();

  constructor() {
    this.config = this.loadConfig();
    this.transporter = this.createTransporter();
    this.setupTemplates();
  }

  private loadConfig(): EmailConfig {
    return {
      service: process.env.EMAIL_SERVICE || 'gmail',
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER || '',
        pass: process.env.EMAIL_PASS || ''
      },
      from: process.env.EMAIL_FROM || 'noreply@admetrics.ai',
      replyTo: process.env.EMAIL_REPLY_TO
    };
  }

  private createTransporter(): nodemailer.Transporter {
    if (!this.config.auth.user || !this.config.auth.pass) {
      logger.warn('Email credentials not configured, using test account');
      return nodemailer.createTransporter({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: 'ethereal.user@ethereal.email',
          pass: 'ethereal.pass'
        }
      });
    }

    return nodemailer.createTransporter({
      service: this.config.service,
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: this.config.auth,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 20000, // 20 seconds
      rateLimit: 5 // 5 emails per rateDelta
    });
  }

  private async setupTemplates(): Promise<void> {
    try {
      const templatesDir = path.join(process.cwd(), 'src', 'templates', 'email');
      
      // Predefined templates
      const templates = [
        'welcome',
        'email-verification',
        'password-reset',
        'campaign-alert',
        'weekly-report',
        'monthly-report',
        'invoice',
        'payment-failed'
      ];

      for (const templateName of templates) {
        try {
          await this.loadTemplate(templateName);
        } catch (error) {
          logger.warn(`Failed to load email template: ${templateName}`, error);
        }
      }
    } catch (error) {
      logger.error('Failed to setup email templates:', error);
    }
  }

  private async loadTemplate(templateName: string): Promise<EmailTemplate> {
    try {
      const templatesDir = path.join(process.cwd(), 'src', 'templates', 'email');
      const htmlPath = path.join(templatesDir, `${templateName}.html`);
      const textPath = path.join(templatesDir, `${templateName}.txt`);
      const metaPath = path.join(templatesDir, `${templateName}.json`);

      const [htmlContent, textContent, metaContent] = await Promise.allSettled([
        fs.readFile(htmlPath, 'utf-8'),
        fs.readFile(textPath, 'utf-8').catch(() => null),
        fs.readFile(metaPath, 'utf-8').catch(() => '{}')
      ]);

      if (htmlContent.status === 'rejected') {
        throw new Error(`Template ${templateName}.html not found`);
      }

      const meta = JSON.parse(
        metaContent.status === 'fulfilled' ? metaContent.value : '{}'
      );

      const template: EmailTemplate = {
        name: templateName,
        subject: meta.subject || `{{subject}}`,
        html: htmlContent.value,
        text: textContent.status === 'fulfilled' ? textContent.value : undefined
      };

      this.templateCache.set(templateName, template);
      return template;
    } catch (error) {
      logger.error(`Failed to load template ${templateName}:`, error);
      throw error;
    }
  }

  private compileTemplate(template: string, context: any): string {
    try {
      const compiled = handlebars.compile(template);
      return compiled(context);
    } catch (error) {
      logger.error('Template compilation failed:', error);
      throw new Error(`Template compilation failed: ${error.message}`);
    }
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      let { html, text, subject } = options;

      // Load and compile template if specified
      if (options.template) {
        let template = this.templateCache.get(options.template);
        
        if (!template) {
          template = await this.loadTemplate(options.template);
        }

        const context = {
          ...options.context,
          appName: 'AdMetrics',
          appUrl: process.env.FRONTEND_URL || 'https://app.admetrics.ai',
          supportEmail: process.env.SUPPORT_EMAIL || 'support@admetrics.ai',
          currentYear: new Date().getFullYear()
        };

        html = this.compileTemplate(template.html, context);
        subject = this.compileTemplate(template.subject, context);
        
        if (template.text) {
          text = this.compileTemplate(template.text, context);
        }
      }

      const mailOptions = {
        from: `AdMetrics <${this.config.from}>`,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
        bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined,
        subject,
        html,
        text,
        replyTo: options.replyTo || this.config.replyTo,
        priority: options.priority || 'normal',
        attachments: options.attachments
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      logger.info('Email sent successfully', {
        to: options.to,
        subject: options.subject,
        messageId: info.messageId,
        template: options.template
      });

      // Log preview URL for development
      if (process.env.NODE_ENV === 'development' && info.previewURL) {
        logger.info('Email preview URL:', info.previewURL);
      }

    } catch (error) {
      logger.error('Failed to send email:', {
        error: error.message,
        to: options.to,
        subject: options.subject,
        template: options.template
      });
      throw new Error(`Email sending failed: ${error.message}`);
    }
  }

  async sendBulkEmails(emails: EmailOptions[]): Promise<{
    sent: number;
    failed: number;
    errors: string[];
  }> {
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const email of emails) {
      try {
        await this.sendEmail(email);
        sent++;
        
        // Add delay to respect rate limits
        await this.delay(1000); // 1 second delay between emails
        
      } catch (error) {
        failed++;
        errors.push(`Failed to send to ${email.to}: ${error.message}`);
      }
    }

    logger.info(`Bulk email completed: ${sent} sent, ${failed} failed`);

    return { sent, failed, errors };
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      logger.info('Email service connection verified');
      return true;
    } catch (error) {
      logger.error('Email service connection failed:', error);
      return false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create singleton instance
const emailService = new EmailService();

// Export convenience function
export const sendEmail = (options: EmailOptions): Promise<void> => {
  return emailService.sendEmail(options);
};

export const sendBulkEmails = (emails: EmailOptions[]) => {
  return emailService.sendBulkEmails(emails);
};

export const verifyEmailConnection = (): Promise<boolean> => {
  return emailService.verifyConnection();
};

// Email template helpers
export const emailTemplates = {
  welcome: (userInfo: { firstName: string; verificationUrl?: string }) => ({
    template: 'welcome',
    context: userInfo
  }),

  emailVerification: (verificationUrl: string) => ({
    template: 'email-verification',
    context: { verificationUrl }
  }),

  passwordReset: (resetUrl: string, userInfo: { firstName: string }) => ({
    template: 'password-reset',
    context: { resetUrl, ...userInfo }
  }),

  campaignAlert: (alert: {
    campaignName: string;
    message: string;
    severity: string;
    actionUrl?: string;
  }) => ({
    template: 'campaign-alert',
    context: alert
  }),

  weeklyReport: (report: {
    userName: string;
    reportUrl: string;
    metrics: {
      totalSpend: number;
      totalClicks: number;
      totalConversions: number;
      averageRoas: number;
    };
    topCampaigns: Array<{
      name: string;
      platform: string;
      roas: number;
    }>;
  }) => ({
    template: 'weekly-report',
    context: report
  }),

  monthlyReport: (report: {
    userName: string;
    reportUrl: string;
    period: string;
    metrics: any;
    insights: string[];
  }) => ({
    template: 'monthly-report',
    context: report
  }),

  invoice: (invoice: {
    invoiceNumber: string;
    amount: number;
    dueDate: string;
    paymentUrl: string;
    userInfo: any;
  }) => ({
    template: 'invoice',
    context: invoice
  }),

  paymentFailed: (payment: {
    amount: number;
    failureReason: string;
    retryUrl: string;
    userInfo: any;
  }) => ({
    template: 'payment-failed',
    context: payment
  })
};

// Email queue for background processing
class EmailQueue {
  private queue: EmailOptions[] = [];
  private processing = false;

  async add(email: EmailOptions): Promise<void> {
    this.queue.push(email);
    
    if (!this.processing) {
      this.process();
    }
  }

  private async process(): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0) {
      const email = this.queue.shift();
      if (email) {
        try {
          await sendEmail(email);
          await this.delay(500); // Rate limiting
        } catch (error) {
          logger.error('Queued email failed:', error);
        }
      }
    }

    this.processing = false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}

export const emailQueue = new EmailQueue();

// High-level email functions
export const sendWelcomeEmail = async (user: {
  email: string;
  firstName: string;
  verificationUrl?: string;
}): Promise<void> => {
  await sendEmail({
    to: user.email,
    subject: 'Welcome to AdMetrics!',
    ...emailTemplates.welcome(user)
  });
};

export const sendVerificationEmail = async (email: string, verificationUrl: string): Promise<void> => {
  await sendEmail({
    to: email,
    subject: 'Verify your AdMetrics account',
    ...emailTemplates.emailVerification(verificationUrl)
  });
};

export const sendPasswordResetEmail = async (
  email: string,
  resetUrl: string,
  firstName: string
): Promise<void> => {
  await sendEmail({
    to: email,
    subject: 'Reset your AdMetrics password',
    ...emailTemplates.passwordReset(resetUrl, { firstName })
  });
};

export const sendCampaignAlert = async (
  email: string,
  alert: {
    campaignName: string;
    message: string;
    severity: string;
    actionUrl?: string;
  }
): Promise<void> => {
  await sendEmail({
    to: email,
    subject: `Campaign Alert: ${alert.campaignName}`,
    priority: alert.severity === 'high' ? 'high' : 'normal',
    ...emailTemplates.campaignAlert(alert)
  });
};

export const sendWeeklyReport = async (
  email: string,
  report: any
): Promise<void> => {
  await sendEmail({
    to: email,
    subject: 'Your Weekly AdMetrics Report',
    ...emailTemplates.weeklyReport(report)
  });
};

export const sendMonthlyReport = async (
  email: string,
  report: any
): Promise<void> => {
  await sendEmail({
    to: email,
    subject: 'Your Monthly AdMetrics Report',
    ...emailTemplates.monthlyReport(report)
  });
};

export default emailService;