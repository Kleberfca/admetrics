// backend/src/config/database.ts
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

// Environment variables with defaults
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/admetrics';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Prisma configuration based on environment
const prismaConfig = {
  datasources: {
    db: {
      url: DATABASE_URL
    }
  },
  log: NODE_ENV === 'development' 
    ? [
        { level: 'query' as const, emit: 'event' as const },
        { level: 'info' as const, emit: 'event' as const },
        { level: 'warn' as const, emit: 'event' as const },
        { level: 'error' as const, emit: 'event' as const }
      ]
    : [
        { level: 'warn' as const, emit: 'event' as const },
        { level: 'error' as const, emit: 'event' as const }
      ],
  errorFormat: 'pretty' as const
};

// Create Prisma client
export const prisma = new PrismaClient(prismaConfig);

// Database connection management
export class DatabaseManager {
  private static instance: DatabaseManager;
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 5000; // 5 seconds

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  async connect(): Promise<void> {
    if (this.connectionStatus === 'connected') {
      return;
    }

    this.connectionStatus = 'connecting';

    try {
      // Test database connection
      await prisma.$connect();
      
      // Setup event listeners
      this.setupEventListeners();
      
      this.connectionStatus = 'connected';
      this.reconnectAttempts = 0;
      
      logger.info('Database connected successfully', {
        url: this.maskDatabaseUrl(DATABASE_URL),
        environment: NODE_ENV
      });

      // Run migrations in development
      if (NODE_ENV === 'development') {
        await this.runMigrations();
      }

    } catch (error) {
      this.connectionStatus = 'error';
      logger.error('Failed to connect to database:', error);
      
      // Attempt reconnection
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        logger.info(`Attempting to reconnect to database (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        
        setTimeout(() => {
          this.connect();
        }, this.reconnectDelay);
      } else {
        logger.error('Max reconnection attempts reached. Database connection failed.');
        throw error;
      }
    }
  }

  async disconnect(): Promise<void> {
    try {
      await prisma.$disconnect();
      this.connectionStatus = 'disconnected';
      logger.info('Database disconnected successfully');
    } catch (error) {
      logger.error('Error disconnecting from database:', error);
      throw error;
    }
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    latency: number;
    details: any;
  }> {
    const start = Date.now();
    
    try {
      await prisma.$queryRaw`SELECT 1`;
      const latency = Date.now() - start;
      
      return {
        status: 'healthy',
        latency,
        details: {
          connection: this.connectionStatus,
          url: this.maskDatabaseUrl(DATABASE_URL),
          environment: NODE_ENV
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: Date.now() - start,
        details: {
          error: error.message,
          connection: this.connectionStatus
        }
      };
    }
  }

  private setupEventListeners(): void {
    // Query logging
    prisma.$on('query', (e) => {
      logger.debug('Database Query', {
        query: e.query,
        params: e.params,
        duration: `${e.duration}ms`,
        target: e.target
      });
    });

    // Info logging
    prisma.$on('info', (e) => {
      logger.info('Database Info', {
        message: e.message,
        target: e.target,
        timestamp: e.timestamp
      });
    });

    // Warning logging
    prisma.$on('warn', (e) => {
      logger.warn('Database Warning', {
        message: e.message,
        target: e.target,
        timestamp: e.timestamp
      });
    });

    // Error logging
    prisma.$on('error', (e) => {
      logger.error('Database Error', {
        message: e.message,
        target: e.target,
        timestamp: e.timestamp
      });
    });

    // Handle process termination
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, closing database connection...');
      await this.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, closing database connection...');
      await this.disconnect();
      process.exit(0);
    });
  }

  private async runMigrations(): Promise<void> {
    try {
      logger.info('Running database migrations...');
      
      // Note: In a production setup, you would use Prisma CLI or separate migration process
      // This is just for development convenience
      const { execSync } = require('child_process');
      execSync('npx prisma migrate deploy', { stdio: 'inherit' });
      
      logger.info('Database migrations completed successfully');
    } catch (error) {
      logger.error('Failed to run migrations:', error);
      // Don't throw error, as the app can still work with existing schema
    }
  }

  private maskDatabaseUrl(url: string): string {
    return url.replace(/:\/\/.*@/, '://***:***@');
  }

  getConnectionStatus(): string {
    return this.connectionStatus;
  }
}

// Database utilities
export class DatabaseUtils {
  /**
   * Execute database transaction with retry logic
   */
  static async withTransaction<T>(
    operation: (prisma: any) => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await prisma.$transaction(operation);
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries && this.isRetryableError(error)) {
          logger.warn(`Transaction attempt ${attempt} failed, retrying...`, {
            error: error.message,
            attempt,
            maxRetries
          });
          
          // Exponential backoff
          await this.delay(Math.pow(2, attempt) * 1000);
        } else {
          logger.error(`Transaction failed after ${attempt} attempts`, {
            error: error.message,
            attempt,
            maxRetries
          });
          break;
        }
      }
    }

    throw lastError;
  }

  /**
   * Check if error is retryable
   */
  private static isRetryableError(error: any): boolean {
    // Common retryable database errors
    const retryableErrors = [
      'P2034', // Transaction conflict
      'P2028', // Transaction API error
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNREFUSED',
      'ETIMEDOUT'
    ];

    return retryableErrors.some(code => 
      error.code === code || error.message.includes(code)
    );
  }

  /**
   * Delay helper
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Paginate query results
   */
  static getPaginationParams(page: number = 1, limit: number = 20): {
    skip: number;
    take: number;
  } {
    const skip = (page - 1) * limit;
    const take = Math.min(limit, 100); // Maximum 100 records per page
    
    return { skip, take };
  }

  /**
   * Build dynamic where clause for filtering
   */
  static buildWhereClause(filters: Record<string, any>): any {
    const where: any = {};

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (typeof value === 'string' && value.includes('*')) {
          // Handle wildcard search
          where[key] = {
            contains: value.replace(/\*/g, ''),
            mode: 'insensitive'
          };
        } else if (Array.isArray(value)) {
          where[key] = { in: value };
        } else if (key.endsWith('_gte') || key.endsWith('_lte')) {
          // Handle range filters
          const baseKey = key.replace(/_gte|_lte/, '');
          if (!where[baseKey]) where[baseKey] = {};
          
          if (key.endsWith('_gte')) {
            where[baseKey].gte = value;
          } else {
            where[baseKey].lte = value;
          }
        } else {
          where[key] = value;
        }
      }
    });

    return where;
  }

  /**
   * Get database statistics
   */
  static async getDatabaseStats(): Promise<{
    tables: Array<{
      name: string;
      rowCount: number;
      size: string;
    }>;
    totalSize: string;
    connectionCount: number;
  }> {
    try {
      // Get table statistics
      const tableStats = await prisma.$queryRaw<Array<{
        table_name: string;
        row_count: number;
        size: string;
      }>>`
        SELECT 
          schemaname||'.'||tablename as table_name,
          n_tup_ins - n_tup_del as row_count,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
        FROM pg_stat_user_tables 
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
      `;

      // Get database size
      const dbSize = await prisma.$queryRaw<Array<{ size: string }>>`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size;
      `;

      // Get connection count
      const connections = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT count(*) as count FROM pg_stat_activity WHERE datname = current_database();
      `;

      return {
        tables: tableStats.map(t => ({
          name: t.table_name,
          rowCount: Number(t.row_count),
          size: t.size
        })),
        totalSize: dbSize[0]?.size || '0 bytes',
        connectionCount: Number(connections[0]?.count || 0)
      };
    } catch (error) {
      logger.error('Failed to get database stats:', error);
      return {
        tables: [],
        totalSize: 'unknown',
        connectionCount: 0
      };
    }
  }

  /**
   * Clean up old records
   */
  static async cleanupOldRecords(
    tableName: string,
    dateField: string,
    daysToKeep: number = 90
  ): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    try {
      const result = await prisma.$executeRawUnsafe(`
        DELETE FROM "${tableName}" 
        WHERE "${dateField}" < $1
      `, cutoffDate);

      logger.info(`Cleaned up ${result} old records from ${tableName}`, {
        cutoffDate,
        daysToKeep
      });

      return result;
    } catch (error) {
      logger.error(`Failed to cleanup old records from ${tableName}:`, error);
      throw error;
    }
  }
}

// Initialize database manager
export const databaseManager = DatabaseManager.getInstance();

// Default export
export default prisma;