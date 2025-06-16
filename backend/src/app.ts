import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import middleware
import { errorHandler } from './middleware/error.middleware';
import { rateLimiter } from './middleware/rate-limit.middleware';

// Import routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import campaignRoutes from './routes/campaign.routes';
import metricsRoutes from './routes/metrics.routes';
import integrationsRoutes from './routes/integrations.routes';
import reportsRoutes from './routes/reports.routes';
import aiRoutes from './routes/ai.routes';

// Import services
import { WebSocketService } from './services/websocket.service';
import { logger } from './utils/logger';

// Import database
import { connectDatabase } from './config/database';
import { connectRedis } from './config/redis';

class App {
  public app: Application;
  public server: any;
  public io: Server;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3000', 10);
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3001',
        credentials: true
      }
    });

    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
    this.initializeWebSocket();
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.FRONTEND_URL || 'http://localhost:3001',
      credentials: true
    }));

    // Body parsing middleware
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Compression middleware
    this.app.use(compression());

    // Logging middleware
    if (process.env.NODE_ENV === 'development') {
      this.app.use(morgan('dev'));
    } else {
      this.app.use(morgan('combined'));
    }

    // Rate limiting
    this.app.use('/api/', rateLimiter);

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });
  }

  private initializeRoutes(): void {
    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/users', userRoutes);
    this.app.use('/api/campaigns', campaignRoutes);
    this.app.use('/api/metrics', metricsRoutes);
    this.app.use('/api/integrations', integrationsRoutes);
    this.app.use('/api/reports', reportsRoutes);
    this.app.use('/api/ai', aiRoutes);

    // Swagger documentation
    if (process.env.NODE_ENV === 'development') {
      const swaggerUi = require('swagger-ui-express');
      const swaggerDocument = require('./swagger.json');
      this.app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    }

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ error: 'Resource not found' });
    });
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  private initializeWebSocket(): void {
    const wsService = WebSocketService.getInstance();
    wsService.initialize(this.io);
  }

  public async start(): Promise<void> {
    try {
      // Connect to databases
      await connectDatabase();
      await connectRedis();

      // Start server
      this.server.listen(this.port, () => {
        logger.info(`Server running on port ${this.port}`);
        logger.info(`Environment: ${process.env.NODE_ENV}`);
      });
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Create and start the application
const app = new App();
app.start();

export default app.app;