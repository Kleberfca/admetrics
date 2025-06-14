import express, { Application, Request, Response } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import dotenv from 'dotenv';

import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { requestLogger, loggerStream } from './utils/logger';
import { rateLimiter } from './middleware/rate-limit.middleware';
import { databaseManager } from './config/database';
import { redisManager } from './config/redis';
import { setupWebSocketHandlers } from './services/websocket.service';
import { validateEnvironmentVariables } from './utils/env-validator';
import { verifyEmailConnection } from './services/email.service';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

class App {
  private app: Application;
  private server: HTTPServer;
  private io: SocketIOServer;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3000', 10);
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializePostMiddleware();
    this.createServer();
    this.setupSwagger();
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: this.getAllowedOrigins(),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }));

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging
    this.app.use(morgan('combined', { stream: loggerStream }));
    this.app.use(requestLogger);

    // Rate limiting
    this.app.use('/api', rateLimiter('api'));

    // Static files
    this.app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
  }

  private initializeRoutes(): void {
    // API routes
    this.app.use('/api', routes);

    // Health check endpoint
    this.app.get('/health', async (req: Request, res: Response) => {
      const dbHealth = await databaseManager.healthCheck();
      const redisHealth = redisManager.isConnected();

      res.status(dbHealth && redisHealth ? 200 : 503).json({
        status: dbHealth && redisHealth ? 'healthy' : 'unhealthy',
        services: {
          database: dbHealth ? 'connected' : 'disconnected',
          redis: redisHealth ? 'connected' : 'disconnected',
        },
        uptime: process.uptime(),
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
          node: process.version
        });

        logger.info(`📚 API Documentation available at http://localhost:${this.port}/api/docs`);
      });

      // Graceful shutdown handlers
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received, starting graceful shutdown...`);

      // Stop accepting new connections
      this.server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Close Socket.IO connections
          this.io.close(() => {
            logger.info('WebSocket connections closed');
          });

          // Disconnect from database
          await databaseManager.disconnect();

          // Disconnect from Redis
          await redisManager.disconnect();

          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('unhandledRejection');
    });
  }
}

// Create and start the application
const app = new App();
app.start();

export default app;