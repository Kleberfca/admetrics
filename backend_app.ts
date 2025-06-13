import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';

// Middleware
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { requestLogger } from './middleware/requestLogger';
import { validateRequest } from './middleware/validation';

// Routes
import authRoutes from './routes/auth.routes';
import campaignsRoutes from './routes/campaigns.routes';
import metricsRoutes from './routes/metrics.routes';
import integrationsRoutes from './routes/integrations.routes';
import reportsRoutes from './routes/reports.routes';
import dashboardRoutes from './routes/dashboard.routes';
import aiInsightsRoutes from './routes/aiInsights.routes';
import usersRoutes from './routes/users.routes';

// Services
import { MetricsService } from './services/metrics.service';
import { DataPipelineService } from './services/dataPipeline.service';
import { WebSocketService } from './services/websocket.service';
import { NotificationService } from './services/notification.service';

// Utils
import { logger } from './utils/logger';
import { gracefulShutdown } from './utils/gracefulShutdown';

// Load environment variables
dotenv.config();

class AdMetricsApp {
  public app: Application;
  public server: any;
  public io: SocketIOServer;
  public prisma: PrismaClient;
  public redis: Redis;
  
  // Services
  private metricsService: MetricsService;
  private dataPipelineService: DataPipelineService;
  private webSocketService: WebSocketService;
  private notificationService: NotificationService;

  constructor() {
    this.app = express();
    this.initializeDatabase();
    this.initializeRedis();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeServices();
    this.initializeWebSocket();
    this.initializeErrorHandling();
  }

  private initializeDatabase(): void {
    this.prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      errorFormat: 'pretty',
    });

    logger.info('Database connection initialized');
  }

  private initializeRedis(): void {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    this.redis = new Redis(redisUrl, {
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.redis.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    this.redis.on('error', (error) => {
      logger.error('Redis connection error:', error);
    });
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "wss:", "ws:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production' 
        ? [process.env.FRONTEND_URL || 'https://dashboard.admetrics.ai']
        : ['http://localhost:3001', 'http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: process.env.NODE_ENV === 'production' ? 100 : 1000,
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', limiter);

    // Body parsing and compression
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(compression());

    // Logging
    if (process.env.NODE_ENV !== 'test') {
      this.app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
    }
    this.app.use(requestLogger);

    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        version: process.env.npm_package_version || '1.0.0',
        services: {
          database: 'connected',
          redis: this.redis.status === 'ready' ? 'connected' : 'disconnected',
        },
      });
    });

    // API documentation
    if (process.env.NODE_ENV !== 'production') {
      const swaggerJSDoc = require('swagger-jsdoc');
      const swaggerUi = require('swagger-ui-express');

      const swaggerDefinition = {
        openapi: '3.0.0',
        info: {
          title: 'AdMetrics API',
          version: '1.0.0',
          description: 'AI-powered advertising analytics platform API',
        },
        servers: [
          {
            url: process.env.API_URL || 'http://localhost:3000',
            description: 'Development server',
          },
        ],
      };

      const options = {
        swaggerDefinition,
        apis: ['./src/routes/*.ts'],
      };

      const swaggerSpec = swaggerJSDoc(options);
      this.app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    }
  }

  private initializeRoutes(): void {
    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/users', authMiddleware, usersRoutes);
    this.app.use('/api/campaigns', authMiddleware, campaignsRoutes);
    this.app.use('/api/metrics', authMiddleware, metricsRoutes);
    this.app.use('/api/integrations', authMiddleware, integrationsRoutes);
    this.app.use('/api/reports', authMiddleware, reportsRoutes);
    this.app.use('/api/dashboard', authMiddleware, dashboardRoutes);
    this.app.use('/api/ai-insights', authMiddleware, aiInsightsRoutes);

    // Serve static files in production
    if (process.env.NODE_ENV === 'production') {
      this.app.use(express.static(path.join(__dirname, '../../../frontend/build')));
      
      this.app.get('*', (req: Request, res: Response) => {
        res.sendFile(path.join(__dirname, '../../../frontend/build/index.html'));
      });
    }

    // Catch 404 and forward to error handler
    this.app.all('*', (req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`,
        error: 'NOT_FOUND',
      });
    });
  }

  private initializeServices(): void {
    this.metricsService = new MetricsService(this.prisma, this.redis);
    this.dataPipelineService = new DataPipelineService(this.prisma, this.redis);
    this.notificationService = new NotificationService(this.prisma, this.redis);
    
    // Start background services
    this.dataPipelineService.startScheduledJobs();
    logger.info('Background services initialized');
  }

  private initializeWebSocket(): void {
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: process.env.NODE_ENV === 'production' 
          ? [process.env.FRONTEND_URL || 'https://dashboard.admetrics.ai']
          : ['http://localhost:3001'],
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    this.webSocketService = new WebSocketService(this.io, this.metricsService);
    this.webSocketService.initialize();
    
    logger.info('WebSocket server initialized');
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler);

    // Graceful shutdown handlers
    process.on('SIGTERM', () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      this.gracefulShutdown();
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT signal received: closing HTTP server');
      this.gracefulShutdown();
    });

    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.gracefulShutdown();
    });

    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught Exception:', error);
      this.gracefulShutdown();
    });
  }

  private async gracefulShutdown(): Promise<void> {
    try {
      logger.info('Starting graceful shutdown...');

      // Stop accepting new connections
      if (this.server) {
        this.server.close();
      }

      // Close WebSocket connections
      if (this.io) {
        this.io.close();
      }

      // Stop background services
      if (this.dataPipelineService) {
        await this.dataPipelineService.stopScheduledJobs();
      }

      // Close database connections
      await this.prisma.$disconnect();
      
      // Close Redis connection
      this.redis.disconnect();

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  public listen(): void {
    const port = process.env.PORT || 3000;
    
    this.server.listen(port, () => {
      logger.info(`🚀 AdMetrics API server is running on port ${port}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
      logger.info(`🔗 API URL: http://localhost:${port}`);
      
      if (process.env.NODE_ENV !== 'production') {
        logger.info(`📚 API Documentation: http://localhost:${port}/api/docs`);
      }
    });
  }
}

// Start the application
const app = new AdMetricsApp();

// Only listen if this file is run directly (not imported)
if (require.main === module) {
  app.listen();
}

export default app;