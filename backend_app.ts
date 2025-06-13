// backend/src/app.ts
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

// Import configurations
import { databaseManager } from './config/database';
import { redisManager } from './config/redis';
import { validateEnvironmentVariables } from './config/api-keys';

// Import middleware
import {
  errorHandler,
  notFoundHandler,
  requestLogger,
  securityHeaders,
  healthCheck
} from './middleware/error.middleware';
import { addCorsHeaders } from './middleware/auth.middleware';

// Import routes
import authRoutes from './routes/auth.routes';
import campaignRoutes from './routes/campaigns.routes';
import metricRoutes from './routes/metrics.routes';
import integrationRoutes from './routes/integrations.routes';
import dashboardRoutes from './routes/dashboard.routes';
import reportRoutes from './routes/reports.routes';
import userRoutes from './routes/users.routes';
import adminRoutes from './routes/admin.routes';

// Import services
import { logger } from './utils/logger';
import { verifyEmailConnection } from './utils/email';

// Import WebSocket handlers
import { setupWebSocketHandlers } from './websocket/handlers';

class AdMetricsApp {
  public app: Application;
  public server: any;
  public io: SocketIOServer;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3000');
    
    this.initializePreMiddleware();
    this.initializeRoutes();
    this.initializePostMiddleware();
    this.createServer();
  }

  private initializePreMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https:"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'", "ws:", "wss:"]
        }
      },
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration
    this.app.use(cors({
      origin: this.getAllowedOrigins(),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-request-id']
    }));

    // Additional CORS headers
    this.app.use(addCorsHeaders);

    // Security headers
    this.app.use(securityHeaders);

    // Compression
    this.app.use(compression());

    // Rate limiting
    this.app.use(rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // limit each IP to 1000 requests per windowMs
      message: {
        success: false,
        message: 'Too many requests, please try again later',
        code: 'RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        // Skip rate limiting for health checks
        return req.path === '/health';
      }
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use(requestLogger);

    // Trust proxy for accurate IP addresses
    this.app.set('trust proxy', 1);
  }

  private initializeRoutes(): void {
    // Health check endpoint (before authentication)
    this.app.get('/health', healthCheck);

    // API documentation
    this.setupSwagger();

    // API routes
    const apiRouter = express.Router();
    
    // Authentication routes (public)
    apiRouter.use('/auth', authRoutes);
    
    // Protected routes
    apiRouter.use('/campaigns', campaignRoutes);
    apiRouter.use('/metrics', metricRoutes);
    apiRouter.use('/integrations', integrationRoutes);
    apiRouter.use('/dashboard', dashboardRoutes);
    apiRouter.use('/reports', reportRoutes);
    apiRouter.use('/users', userRoutes);
    apiRouter.use('/admin', adminRoutes);

    // Mount API routes
    this.app.use('/api', apiRouter);

    // API root endpoint
    this.app.get('/api', (req: Request, res: Response) => {
      res.json({
        success: true,
        message: 'AdMetrics API v1.0',
        version: process.env.npm_package_version || '1.0.0',
        documentation: '/api/docs',
        status: 'operational',
        timestamp: new Date().toISOString()
      });
    });

    // Root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        success: true,
        message: 'Welcome to AdMetrics AI Dashboard API',
        version: process.env.npm_package_version || '1.0.0',
        api: '/api',
        documentation: '/api/docs',
        health: '/health'
      });
    });
  }

  private initializePostMiddleware(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler (must be last)
    this.app.use(errorHandler);
  }

  private createServer(): void {
    this.server = createServer(this.app);
    
    // Setup Socket.IO
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: this.getAllowedOrigins(),
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    // Setup WebSocket handlers
    setupWebSocketHandlers(this.io);
  }

  private setupSwagger(): void {
    const options = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'AdMetrics AI Dashboard API',
          version: process.env.npm_package_version || '1.0.0',
          description: 'AI-powered advertising analytics and optimization platform',
          contact: {
            name: 'AdMetrics Support',
            email: 'support@admetrics.ai',
            url: 'https://admetrics.ai'
          },
          license: {
            name: 'MIT',
            url: 'https://opensource.org/licenses/MIT'
          }
        },
        servers: [
          {
            url: process.env.API_URL || `http://localhost:${this.port}`,
            description: 'Development server'
          },
          {
            url: 'https://api.admetrics.ai',
            description: 'Production server'
          }
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT'
            },
            apiKey: {
              type: 'apiKey',
              in: 'header',
              name: 'x-api-key'
            }
          }
        },
        security: [
          { bearerAuth: [] },
          { apiKey: [] }
        ]
      },
      apis: [
        './src/routes/*.ts',
        './src/controllers/*.ts',
        './src/types/*.ts'
      ]
    };

    const specs = swaggerJsdoc(options);
    
    this.app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specs, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'AdMetrics API Documentation',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        tryItOutEnabled: true
      }
    }));

    // JSON endpoint for API spec
    this.app.get('/api/docs.json', (req: Request, res: Response) => {
      res.json(specs);
    });
  }

  private getAllowedOrigins(): string[] {
    const origins = process.env.ALLOWED_ORIGINS?.split(',') || [];
    
    // Default allowed origins
    const defaultOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'https://app.admetrics.ai',
      'https://staging.admetrics.ai'
    ];

    return [...defaultOrigins, ...origins].filter(Boolean);
  }

  public async start(): Promise<void> {
    try {
      // Validate environment variables
      const envValidation = validateEnvironmentVariables();
      if (!envValidation.isValid) {
        logger.error('Missing required environment variables:', envValidation.missing);
        process.exit(1);
      }

      if (envValidation.warnings.length > 0) {
        logger.warn('Optional environment variables not set:', envValidation.warnings);
      }

      // Connect to database
      await databaseManager.connect();

      // Connect to Redis
      await redisManager.connect();

      // Verify email service (non-blocking)
      verifyEmailConnection().catch(error => {
        logger.warn('Email service verification failed:', error);
      });

      // Start server
      this.server.listen(this.port, () => {
        logger.info(`🚀 AdMetrics API server started successfully`, {
          port: this.port,
          environment: process.env.NODE_ENV || 'development',
          version: process.env.npm_package_version || '1.0.0',
          pid: process.pid,
          urls: {
            api: `http://localhost:${this.port}/api`,
            docs: `http://localhost:${this.port}/api/docs`,
            health: `http://localhost:${this.port}/health`
          }
        });
      });

      // Handle graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      // Close server
      this.server.close(() => {
        logger.info('HTTP server closed');
      });

      // Close WebSocket connections
      this.io.close(() => {
        logger.info('WebSocket server closed');
      });

      try {
        // Close database connections
        await databaseManager.disconnect();
        logger.info('Database connections closed');

        // Close Redis connections
        await redisManager.disconnect();
        logger.info('Redis connections closed');

        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('unhandledRejection');
    });
  }

  public getApp(): Application {
    return this.app;
  }

  public getServer(): any {
    return this.server;
  }

  public getIO(): SocketIOServer {
    return this.io;
  }
}

// Create and export app instance
const adMetricsApp = new AdMetricsApp();

// Start server if this file is run directly
if (require.main === module) {
  adMetricsApp.start();
}

export default adMetricsApp;
export { AdMetricsApp };