import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

// Extend PrismaClient with middleware
const prismaClientSingleton = () => {
  const prisma = new PrismaClient({
    log: [
      {
        emit: 'event',
        level: 'query',
      },
      {
        emit: 'event',
        level: 'error',
      },
      {
        emit: 'event',
        level: 'info',
      },
      {
        emit: 'event',
        level: 'warn',
      },
    ],
    errorFormat: 'minimal',
  });

  // Query logging in development
  if (process.env.NODE_ENV === 'development') {
    prisma.$on('query', (e: Prisma.QueryEvent) => {
      logger.debug('Query:', {
        query: e.query,
        params: e.params,
        duration: `${e.duration}ms`,
      });
    });
  }

  // Error logging
  prisma.$on('error', (e: Prisma.LogEvent) => {
    logger.error('Database error:', {
      message: e.message,
      target: e.target,
    });
  });

  // Slow query logging
  prisma.$use(async (params, next) => {
    const before = Date.now();
    const result = await next(params);
    const after = Date.now();
    const duration = after - before;

    if (duration > 1000) {
      logger.warn('Slow query detected:', {
        model: params.model,
        action: params.action,
        duration: `${duration}ms`,
      });
    }

    return result;
  });

  // Soft delete middleware
  prisma.$use(async (params, next) => {
    // Check for soft delete models
    const softDeleteModels = ['User', 'Campaign', 'Integration'];
    
    if (softDeleteModels.includes(params.model || '')) {
      if (params.action === 'delete') {
        params.action = 'update';
        params.args['data'] = { deletedAt: new Date() };
      }
      
      if (params.action === 'deleteMany') {
        params.action = 'updateMany';
        if (params.args.data !== undefined) {
          params.args.data['deletedAt'] = new Date();
        } else {
          params.args['data'] = { deletedAt: new Date() };
        }
      }
      
      // Exclude soft deleted records from queries
      if (params.action === 'findFirst' || params.action === 'findMany') {
        if (!params.args) {
          params.args = {};
        }
        if (!params.args.where) {
          params.args.where = {};
        }
        params.args.where['deletedAt'] = null;
      }
    }

    return next(params);
  });

  return prisma;
};

// Type for the singleton instance
type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

// Global store for the singleton
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined;
};

// Create or reuse the singleton
export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Database connection manager
export const databaseManager = {
  async connect(): Promise<void> {
    try {
      await prisma.$connect();
      logger.info('Database connection established');
      
      // Test the connection
      await prisma.$queryRaw`SELECT 1`;
      logger.info('Database connection verified');
    } catch (error) {
      logger.error('Failed to connect to database:', error);
      throw error;
    }
  },

  async disconnect(): Promise<void> {
    try {
      await prisma.$disconnect();
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error disconnecting from database:', error);
      throw error;
    }
  },

  async healthCheck(): Promise<boolean> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  },

  async runMigrations(): Promise<void> {
    try {
      logger.info('Running database migrations...');
      // Migrations are handled by Prisma CLI
      // This is a placeholder for any custom migration logic
      logger.info('Database migrations completed');
    } catch (error) {
      logger.error('Migration error:', error);
      throw error;
    }
  },
};

// Transaction helper
export async function withTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: {
    maxWait?: number;
    timeout?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
  }
): Promise<T> {
  return prisma.$transaction(fn, {
    maxWait: options?.maxWait || 2000,
    timeout: options?.timeout || 5000,
    isolationLevel: options?.isolationLevel || Prisma.TransactionIsolationLevel.ReadCommitted,
  });
}

// Pagination helper
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export async function paginate<T>(
  model: any,
  params: PaginationParams & { where?: any; include?: any; select?: any }
): Promise<PaginatedResult<T>> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    model.findMany({
      where: params.where,
      include: params.include,
      select: params.select,
      skip,
      take: limit,
      orderBy: params.sortBy
        ? { [params.sortBy]: params.sortOrder || 'desc' }
        : undefined,
    }),
    model.count({ where: params.where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}