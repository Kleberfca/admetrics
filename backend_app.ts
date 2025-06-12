import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import 'reflect-metadata';

// Internal imports
import { PrismaClient } from '@prisma/client';
import { RedisClient } from './config/redis';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/error.middleware';
import { authMiddleware } from './middleware/auth.middleware';

// Route imports
import authRoutes from './routes/auth.routes';
import campaignsRoutes from './routes/campaigns.routes';
import metricsRoutes from './routes/metrics.routes';
import integrationsRoutes from './routes/integrations.routes';
import reportsRoutes from './routes/reports.routes';
import dashboardRoutes from './routes/dashboard.routes';
import aiInsightsRoutes from './routes/ai-insights.routes';

// Services
import { MetricsService } from './services/metrics.service';
import { WebSocketService } from './services/websocket.service';
import { DataPipelineService } from './services/data-pipeline.service';

// Swagger documentation
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

// Load environment variables
dotenv.config();

class App {
  public app: Application;
  public server: Server;
  public io: SocketIOServer;
  public prisma: PrismaClient;
  public redis: RedisClient;
  
  private port: number;
  private metricsService: MetricsService;
  private webSocketService: WebSocketService;
  private dataPipelineService: DataPipelineService;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3000', 10);
    this.prisma = new PrismaClient();
    this.redis = new RedisClient();
    
    this.initializeMiddlewares();
    this.initializeSwagger();
    this.initializeRoutes();
    this.initializeServices();
    this.initializeWebSocket();
    this.initializeErrorHandling();
  }

  private initializeMiddlewares(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      referrerPolicy: { policy: "same-origin" }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.FRONTEND_URL || 'http://localhost:3001',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));

    // Compression and logging
    this.app.use(compression());
    this.app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // limit each IP to 1000 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);

    // Body parsing middleware
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Request ID for tracking
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      req.id = Math.random().toString(36).substring(7);
      res.set('X-Request-ID', req.id);
      next();
    });
  }

  private initializeSwagger(): void {
    const swaggerOptions = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'AdMetrics AI Dashboard API',
          version: '1.0.0',
          description: 'API for AdMetrics AI Dashboard - Advertising Campaign Analytics with AI',
          contact: {
            name: 'AdMetrics Team',
            email: 'support@admetrics.ai'
          }
        },
        servers: [
          {
            url: process.env.API_URL || 'http://localhost:3000',
            description: 'Development server'
          }
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT'
            }
          }
        }
      },
      apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
    };

    const specs = swaggerJsdoc(swaggerOptions);
    this.app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specs));
  }

  private initializeRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/campaigns', authMiddleware, campaignsRoutes);
    this.app.use('/api/metrics', authMiddleware, metricsRoutes);
    this.app.use('/api/integrations', authMiddleware, integrationsRoutes);
    this.app.use('/api/reports', authMiddleware, reportsRoutes);
    this.app.use('/api/dashboard', authMiddleware, dashboardRoutes);
    this.app.use('/api/ai-insights', authMiddleware, aiInsightsRoutes);

    // Catch 404 and forward to error handler
    this.app.all('*', (req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`
      });
    });
  }

  private initializeServices(): void {
    this.metricsService = new MetricsService(this.prisma, this.redis);
    this.dataPipelineService = new DataPipelineService(this.prisma, this.redis);
    
    // Start data pipeline background processes
    this.dataPipelineService.startScheduledJobs();
  }

  private initializeWebSocket(): void {
    this.server = new Server(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3001',
        methods: ['GET', 'POST']
      }
    });

    this.webSocketService = new WebSocketService(this.io, this.metricsService);
    this.webSocketService.initialize();
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler);

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err: Error) => {
      logger.error('Unhandled Promise Rejection:', err);
      this.gracefulShutdown();
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (err: Error) => {
      logger.error('Uncaught Exception:', err);
      this.gracefulShutdown();
    });

    // Handle SIGTERM signal (Docker stop)
    process.on('SIGTERM', () => {
      logger.info('SIGTERM signal received');
      this.gracefulShutdown();
    });

    // Handle SIGINT signal (Ctrl+C)
    process.on('SIGINT', () => {
      logger.info('SIGINT signal received');
      this.gracefulShutdown();
    });
  }

  private async gracefulShutdown(): Promise<void> {
    logger.info('Starting graceful shutdown...');

    // Close server
    if (this.server) {
      this.server.close(() => {
        logger.info('HTTP server closed');
      });
    }

    // Close WebSocket
    if (this.io) {
      this.io.close(() => {
        logger.info('WebSocket server closed');
      });
    }

    // Close database connections
    await this.prisma.$disconnect();
    await this.redis.disconnect();

    logger.info('Graceful shutdown completed');
    process.exit(0);
  }

  public async initialize(): Promise<void> {
    try {
      // Connect to database
      await this.prisma.$connect();
      logger.info('Connected to PostgreSQL database');

      // Connect to Redis
      await this.redis.connect();
      logger.info('Connected to Redis cache');

      // Start server
      this.server = this.app.listen(this.port, () => {
        logger.info(`🚀 AdMetrics API Server running on port ${this.port}`);
        logger.info(`📚 API Documentation available at http://localhost:${this.port}/api/docs`);
        logger.info(`🔍 Health check available at http://localhost:${this.port}/health`);
      });

    } catch (error) {
      logger.error('Failed to initialize application:', error);
      process.exit(1);
    }
  }

  public getApp(): Application {
    return this.app;
  }

  public getServer(): Server {
    return this.server;
  }
}

// Create and initialize application
const application = new App();

// Start the application
if (require.main === module) {
  application.initialize().catch((error) => {
    logger.error('Failed to start application:', error);
    process.exit(1);
  });
}

export default application;