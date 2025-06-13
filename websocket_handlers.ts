// backend/src/websocket/handlers.ts
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { MetricsService } from '../services/metrics.service';
import { redisManager } from '../config/redis';

const prisma = new PrismaClient();
const metricsService = new MetricsService();

interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

interface RoomData {
  userId: string;
  campaigns: string[];
  metrics: string[];
  updateInterval: number;
}

// Store room subscriptions
const roomSubscriptions = new Map<string, RoomData>();

/**
 * Setup WebSocket handlers
 */
export const setupWebSocketHandlers = (io: SocketIOServer): void => {
  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      
      if (!token) {
        return next(new Error('Authentication required'));
      }

      // Verify JWT token
      const JWT_SECRET = process.env.JWT_SECRET!;
      const payload = jwt.verify(token, JWT_SECRET) as any;

      // Get user from database
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          email: true,
          role: true,
          isEmailVerified: true,
          accountLockedUntil: true
        }
      });

      if (!user) {
        return next(new Error('User not found'));
      }

      // Check if account is locked
      if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
        return next(new Error('Account is locked'));
      }

      // Add user to socket
      socket.user = {
        id: user.id,
        email: user.email,
        role: user.role
      };

      next();
    } catch (error) {
      logger.error('WebSocket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  // Connection handler
  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info(`WebSocket client connected: ${socket.user?.email} (${socket.id})`);

    // Join user to their personal room
    const userRoom = `user:${socket.user?.id}`;
    socket.join(userRoom);

    // Handle dashboard subscription
    socket.on('subscribe_dashboard', async (data: {
      campaigns?: string[];
      metrics?: string[];
      updateInterval?: number;
    }) => {
      try {
        const userId = socket.user!.id;
        const roomId = `dashboard:${userId}`;
        
        // Leave previous room if exists
        socket.leave(roomId);
        
        // Join new room
        socket.join(roomId);
        
        // Store subscription data
        roomSubscriptions.set(roomId, {
          userId,
          campaigns: data.campaigns || [],
          metrics: data.metrics || ['spend', 'clicks', 'conversions', 'roas'],
          updateInterval: data.updateInterval || 30000 // 30 seconds default
        });

        // Send initial data
        const initialData = await getDashboardData(userId, data.campaigns, data.metrics);
        socket.emit('dashboard_data', initialData);

        // Setup periodic updates
        setupPeriodicUpdates(io, roomId);

        logger.info(`User ${userId} subscribed to dashboard updates`);
      } catch (error) {
        logger.error('Dashboard subscription error:', error);
        socket.emit('error', { message: 'Failed to subscribe to dashboard updates' });
      }
    });

    // Handle campaign subscription
    socket.on('subscribe_campaigns', async (data: {
      campaignIds: string[];
      updateInterval?: number;
    }) => {
      try {
        const userId = socket.user!.id;
        
        // Verify user owns these campaigns
        const campaigns = await prisma.campaign.findMany({
          where: {
            id: { in: data.campaignIds },
            userId
          },
          select: { id: true, name: true, platform: true }
        });

        if (campaigns.length === 0) {
          return socket.emit('error', { message: 'No valid campaigns found' });
        }

        const roomId = `campaigns:${userId}:${data.campaignIds.join(',')}`;
        socket.join(roomId);

        // Send initial campaign data
        const realTimeMetrics = await metricsService.getRealTimeMetrics(data.campaignIds);
        socket.emit('campaign_metrics', {
          campaigns: realTimeMetrics,
          timestamp: new Date()
        });

        logger.info(`User ${userId} subscribed to campaigns: ${data.campaignIds.join(', ')}`);
      } catch (error) {
        logger.error('Campaign subscription error:', error);
        socket.emit('error', { message: 'Failed to subscribe to campaign updates' });
      }
    });

    // Handle alerts subscription
    socket.on('subscribe_alerts', async () => {
      try {
        const userId = socket.user!.id;
        const alertsRoom = `alerts:${userId}`;
        socket.join(alertsRoom);

        logger.info(`User ${userId} subscribed to alerts`);
      } catch (error) {
        logger.error('Alerts subscription error:', error);
        socket.emit('error', { message: 'Failed to subscribe to alerts' });
      }
    });

    // Handle unsubscribe
    socket.on('unsubscribe', (roomType: string) => {
      const userId = socket.user!.id;
      const roomId = `${roomType}:${userId}`;
      socket.leave(roomId);
      
      if (roomSubscriptions.has(roomId)) {
        roomSubscriptions.delete(roomId);
      }

      logger.info(`User ${userId} unsubscribed from ${roomType}`);
    });

    // Handle sync request
    socket.on('request_sync', async (data: { integrationId?: string }) => {
      try {
        const userId = socket.user!.id;
        
        // Trigger sync for user's integrations
        const integrations = await prisma.integration.findMany({
          where: {
            userId,
            ...(data.integrationId && { id: data.integrationId }),
            status: 'CONNECTED',
            syncEnabled: true
          }
        });

        socket.emit('sync_started', {
          message: `Starting sync for ${integrations.length} integration(s)`,
          integrations: integrations.map(i => ({ id: i.id, name: i.name, platform: i.platform }))
        });

        // In a real implementation, this would trigger background sync jobs
        logger.info(`Sync requested by user ${userId} for ${integrations.length} integrations`);
      } catch (error) {
        logger.error('Sync request error:', error);
        socket.emit('error', { message: 'Failed to start sync' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      logger.info(`WebSocket client disconnected: ${socket.user?.email} (${socket.id}) - ${reason}`);
      
      // Clean up subscriptions
      const userId = socket.user?.id;
      if (userId) {
        const roomsToClean = Array.from(roomSubscriptions.keys()).filter(room => 
          room.includes(userId)
        );
        
        roomsToClean.forEach(room => {
          roomSubscriptions.delete(room);
        });
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error(`WebSocket error for user ${socket.user?.email}:`, error);
    });
  });

  // Setup Redis pub/sub for cross-instance communication
  setupRedisPubSub(io);

  logger.info('WebSocket handlers initialized');
};

/**
 * Get dashboard data for WebSocket updates
 */
async function getDashboardData(
  userId: string,
  campaigns?: string[],
  metrics?: string[]
): Promise<any> {
  try {
    const endDate = new Date();
    const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours

    const query = {
      userId,
      startDate,
      endDate,
      campaignIds: campaigns,
      granularity: 'hour' as const,
      metrics
    };

    const result = await metricsService.getMetrics(query);
    
    // Get real-time data for active campaigns
    const activeCampaigns = await prisma.campaign.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        ...(campaigns && { id: { in: campaigns } })
      },
      select: { id: true }
    });

    const realTimeData = activeCampaigns.length > 0 
      ? await metricsService.getRealTimeMetrics(activeCampaigns.map(c => c.id))
      : [];

    return {
      metrics: result.aggregated,
      realTime: realTimeData,
      timestamp: new Date()
    };
  } catch (error) {
    logger.error('Error getting dashboard data:', error);
    return { error: 'Failed to get dashboard data' };
  }
}

/**
 * Setup periodic updates for dashboard
 */
function setupPeriodicUpdates(io: SocketIOServer, roomId: string): void {
  const subscription = roomSubscriptions.get(roomId);
  if (!subscription) return;

  const intervalId = setInterval(async () => {
    try {
      // Check if room still has clients
      const room = io.sockets.adapter.rooms.get(roomId);
      if (!room || room.size === 0) {
        clearInterval(intervalId);
        roomSubscriptions.delete(roomId);
        return;
      }

      // Get updated data
      const data = await getDashboardData(
        subscription.userId,
        subscription.campaigns,
        subscription.metrics
      );

      // Send to all clients in room
      io.to(roomId).emit('dashboard_update', data);
    } catch (error) {
      logger.error(`Error in periodic update for room ${roomId}:`, error);
    }
  }, subscription.updateInterval);

  // Store interval ID for cleanup
  (roomSubscriptions.get(roomId) as any).intervalId = intervalId;
}

/**
 * Setup Redis pub/sub for cross-instance communication
 */
function setupRedisPubSub(io: SocketIOServer): void {
  // Subscribe to platform events
  redisManager.subscribe('platform:sync:completed', (message) => {
    const { userId, platform, results } = message;
    io.to(`user:${userId}`).emit('sync_completed', {
      platform,
      results,
      timestamp: new Date()
    });
  });

  redisManager.subscribe('platform:sync:error', (message) => {
    const { userId, platform, error } = message;
    io.to(`user:${userId}`).emit('sync_error', {
      platform,
      error,
      timestamp: new Date()
    });
  });

  // Subscribe to alert events
  redisManager.subscribe('alerts:new', (message) => {
    const { userId, alert } = message;
    io.to(`alerts:${userId}`).emit('new_alert', {
      alert,
      timestamp: new Date()
    });
  });

  // Subscribe to campaign events
  redisManager.subscribe('campaigns:status_changed', (message) => {
    const { userId, campaignId, oldStatus, newStatus } = message;
    io.to(`user:${userId}`).emit('campaign_status_changed', {
      campaignId,
      oldStatus,
      newStatus,
      timestamp: new Date()
    });
  });

  // Subscribe to metrics updates
  redisManager.subscribe('metrics:real_time', (message) => {
    const { campaignIds, metrics } = message;
    
    // Send to all subscribed rooms
    campaignIds.forEach((campaignId: string) => {
      const rooms = Array.from(io.sockets.adapter.rooms.keys()).filter(room =>
        room.startsWith('campaigns:') && room.includes(campaignId)
      );
      
      rooms.forEach(room => {
        io.to(room).emit('real_time_metrics', {
          campaignId,
          metrics: metrics[campaignId],
          timestamp: new Date()
        });
      });
    });
  });
}

/**
 * Broadcast alert to user
 */
export const broadcastAlert = async (
  io: SocketIOServer,
  userId: string,
  alert: {
    type: string;
    severity: 'low' | 'medium' | 'high';
    message: string;
    campaignId?: string;
    campaignName?: string;
  }
): Promise<void> => {
  try {
    // Emit to user's personal room
    io.to(`user:${userId}`).emit('new_alert', {
      ...alert,
      timestamp: new Date()
    });

    // Also emit to alerts room if user is subscribed
    io.to(`alerts:${userId}`).emit('new_alert', {
      ...alert,
      timestamp: new Date()
    });

    // Store alert in Redis for persistence
    await redisManager.publish('alerts:new', {
      userId,
      alert
    });

    logger.info(`Alert broadcasted to user ${userId}: ${alert.message}`);
  } catch (error) {
    logger.error('Error broadcasting alert:', error);
  }
};

/**
 * Broadcast campaign status change
 */
export const broadcastCampaignStatusChange = async (
  io: SocketIOServer,
  userId: string,
  campaignId: string,
  oldStatus: string,
  newStatus: string
): Promise<void> => {
  try {
    const event = {
      campaignId,
      oldStatus,
      newStatus,
      timestamp: new Date()
    };

    // Emit to user's personal room
    io.to(`user:${userId}`).emit('campaign_status_changed', event);

    // Emit to dashboard room
    io.to(`dashboard:${userId}`).emit('campaign_status_changed', event);

    // Publish to Redis for cross-instance communication
    await redisManager.publish('campaigns:status_changed', {
      userId,
      campaignId,
      oldStatus,
      newStatus
    });

    logger.info(`Campaign status change broadcasted: ${campaignId} ${oldStatus} -> ${newStatus}`);
  } catch (error) {
    logger.error('Error broadcasting campaign status change:', error);
  }
};

/**
 * Broadcast sync completion
 */
export const broadcastSyncCompletion = async (
  io: SocketIOServer,
  userId: string,
  platform: string,
  results: any
): Promise<void> => {
  try {
    const event = {
      platform,
      results,
      timestamp: new Date()
    };

    // Emit to user's personal room
    io.to(`user:${userId}`).emit('sync_completed', event);

    // Publish to Redis
    await redisManager.publish('platform:sync:completed', {
      userId,
      platform,
      results
    });

    logger.info(`Sync completion broadcasted for user ${userId}, platform: ${platform}`);
  } catch (error) {
    logger.error('Error broadcasting sync completion:', error);
  }
};

/**
 * Broadcast real-time metrics update
 */
export const broadcastMetricsUpdate = async (
  io: SocketIOServer,
  campaignIds: string[],
  metrics: Record<string, any>
): Promise<void> => {
  try {
    // Publish to Redis for cross-instance communication
    await redisManager.publish('metrics:real_time', {
      campaignIds,
      metrics
    });

    logger.debug(`Real-time metrics update broadcasted for campaigns: ${campaignIds.join(', ')}`);
  } catch (error) {
    logger.error('Error broadcasting metrics update:', error);
  }
};

/**
 * Get WebSocket server stats
 */
export const getWebSocketStats = (io: SocketIOServer): {
  connectedClients: number;
  totalRooms: number;
  activeSubscriptions: number;
} => {
  return {
    connectedClients: io.sockets.sockets.size,
    totalRooms: io.sockets.adapter.rooms.size,
    activeSubscriptions: roomSubscriptions.size
  };
};