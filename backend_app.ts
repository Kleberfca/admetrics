import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { createServer } from 'http';
import { Server } from 'socket.io';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

// Middleware
import { authMiddleware } from './middleware/auth.middleware';
import { errorHandler } from './middleware/error.middleware';
import { requestLogger } from './middleware/logger.middleware';
import { rateLimitMiddleware } from './middleware/rate-limit.middleware';

// Routes
import authRoutes from './routes/auth.routes';
import dashboardRoutes from './routes/dashboard.routes';
import campaignsRoutes from './routes/campaigns.routes';
import metricsRoutes from './routes/metrics.routes';
import integrationsRoutes from './routes/integrations.routes';
import reportsRoutes from './routes/reports.routes';
import aiInsightsRoutes from './routes/ai-insights.routes';

// Services
import { WebSocketService } from './services/websocket.service';
import { logger } from './utils/logger';

// Types
import type { Application } from 'express';

class AdMetricsApp {
  public app: Application;
  public server: any;
  public io: Server;
  public prisma: PrismaClient;
  public redis: Redis;
  public websocketService: WebSocketService;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.initializeDatabase();
    this.initializeRedis();
    this.initializeWebSocket();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeSwagger();
    this.initializeErrorHandling();
  }

  private initializeDatabase(): void {
    this.prisma = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
      errorFormat: 'pretty',
    });

    // Handle graceful shutdown
    process.on('beforeExit', async () => {
      await this.prisma.$disconnect();
    });
  }

  private initializeRedis(): void {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryDelayOnFailure: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
    });

    this.redis.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    this.redis.on('error', (error) => {
      logger.error('Redis connection error:', error);
    });
  }

  private initializeWebSocket(): void {
    this.io = new Server(this.server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.websocketService = new WebSocketService(this.io, this.prisma, this.redis);
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
          scriptSrc: ["'self'"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: [
        process.env.FRONTEND_URL || 'http://localhost:3000',
        'http://localhost:3001', // Development
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }));

    // Compression and parsing
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use(requestLogger);

    // Global rate limiting
    this.app.use(rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // Limit each IP to 1000 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    }));

    // Health check
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        version: process.env.npm_package_version || '1.0.0',
      });
    });

    // API status
    this.app.get('/api/status', async (req, res) => {
      try {
        // Check database connection
        await this.prisma.$queryRaw`SELECT 1`;
        
        // Check Redis connection
        await this.redis.ping();

        res.status(200).json({
          status: 'operational',
          services: {
            database: 'connected',
            redis: 'connected',
            websocket: 'active',
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('Health check failed:', error);
        res.status(503).json({
          status: 'degraded',
          error: 'Service health check failed',
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  private initializeRoutes(): void {
    const apiRouter = express.Router();

    // API routes
    apiRouter.use('/auth', authRoutes);
    apiRouter.use('/dashboard', authMiddleware, dashboardRoutes);
    apiRouter.use('/campaigns', authMiddleware, campaignsRoutes);
    apiRouter.use('/metrics', authMiddleware, metricsRoutes);
    apiRouter.use('/integrations', authMiddleware, integrationsRoutes);
    apiRouter.use('/reports', authMiddleware, reportsRoutes);
    apiRouter.use('/ai-insights', authMiddleware, aiInsightsRoutes);

    // Mount API router
    this.app.use('/api', apiRouter);

    // Catch-all route for undefined endpoints
    this.app.use('/api/*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl,
      });
    });
  }

  private initializeSwagger(): void {
    const swaggerOptions = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'AdMetrics AI Dashboard API',
          version: '1.0.0',
          description: 'API documentation for AdMetrics AI Dashboard',
          contact: {
            name: 'AdMetrics Team',
            email: 'dev@admetrics.ai',
          },
        },
        servers: [
          {
            url: process.env.API_URL || 'http://localhost:3001',
            description: 'Development server',
          },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
        security: [
          {
            bearerAuth: [],
          },
        ],
      },
      apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
    };

    const swaggerSpec = swaggerJsdoc(swaggerOptions);
    
    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'AdMetrics API Documentation',
    }));
  }

  private initializeErrorHandling(): void {
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Resource not found',
        path: req.originalUrl,
      });
    });

    // Global error handler
    this.app.use(errorHandler);

    // Unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });
  }

  public listen(port: number): void {
    this.server.listen(port, () => {
      logger.info(`🚀 AdMetrics Backend running on port ${port}`);
      logger.info(`📚 API Documentation: http://localhost:${port}/api-docs`);
      logger.info(`🔗 WebSocket server ready`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  }

  public async gracefulShutdown(): Promise<void> {
    logger.info('Starting graceful shutdown...');

    return new Promise((resolve) => {
      this.server.close(async () => {
        logger.info('HTTP server closed');

        // Close WebSocket connections
        this.io.close();
        logger.info('WebSocket server closed');

        // Close database connection
        await this.prisma.$disconnect();
        logger.info('Database connection closed');

        // Close Redis connection
        this.redis.disconnect();
        logger.info('Redis connection closed');

        logger.info('Graceful shutdown completed');
        resolve();
      });
    });
  }
}

// Initialize and start the application
const app = new AdMetricsApp();
const port = parseInt(process.env.PORT || '3001');

// Start server
app.listen(port);

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received');
  await app.gracefulShutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received');
  await app.gracefulShutdown();
  process.exit(0);
});

export default app;