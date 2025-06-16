import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

interface SocketUser {
  userId: string;
  socketId: string;
  connectedAt: Date;
}

export class WebSocketService {
  private static instance: WebSocketService;
  private io: Server | null = null;
  private userSockets: Map<string, Set<string>> = new Map();

  private constructor() {}

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  initialize(io: Server): void {
    this.io = io;

    // Configure middleware
    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication error'));
        }

        const decoded = jwt.verify(
          token,
          process.env.JWT_SECRET || 'default-secret'
        ) as any;

        socket.data.userId = decoded.userId;
        socket.data.role = decoded.role;

        next();
      } catch (error) {
        next(new Error('Authentication error'));
      }
    });

    // Handle connections
    io.on('connection', async (socket) => {
      const userId = socket.data.userId;
      logger.info(`User ${userId} connected via WebSocket`);

      // Add to user sockets map
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(socket.id);

      // Store in Redis for multi-server support
      await this.storeSocketConnection(userId, socket.id);

      // Join user room
      socket.join(`user:${userId}`);

      // Handle events
      this.setupEventHandlers(socket);

      // Handle disconnect
      socket.on('disconnect', async () => {
        logger.info(`User ${userId} disconnected`);
        
        // Remove from user sockets
        const userSocketSet = this.userSockets.get(userId);
        if (userSocketSet) {
          userSocketSet.delete(socket.id);
          if (userSocketSet.size === 0) {
            this.userSockets.delete(userId);
          }
        }

        // Remove from Redis
        await this.removeSocketConnection(userId, socket.id);
      });
    });
  }

  private setupEventHandlers(socket: Socket): void {
    const userId = socket.data.userId;

    // Subscribe to campaign updates
    socket.on('subscribe:campaign', async (campaignId: string) => {
      // Verify user has access to campaign
      const hasAccess = await this.verifyUserCampaignAccess(userId, campaignId);
      if (hasAccess) {
        socket.join(`campaign:${campaignId}`);
        socket.emit('subscribed:campaign', { campaignId });
      } else {
        socket.emit('error', { message: 'Access denied to campaign' });
      }
    });

    // Unsubscribe from campaign updates
    socket.on('unsubscribe:campaign', (campaignId: string) => {
      socket.leave(`campaign:${campaignId}`);
      socket.emit('unsubscribed:campaign', { campaignId });
    });

    // Subscribe to metrics updates
    socket.on('subscribe:metrics', async (data: { campaignIds?: string[], type: string }) => {
      const room = `metrics:${userId}:${data.type}`;
      socket.join(room);
      socket.emit('subscribed:metrics', { room });
    });

    // Handle metric updates request
    socket.on('request:metrics', async (data: { campaignIds: string[], metrics: string[] }) => {
      // Emit request to metrics service
      this.emitToUser(userId, 'metrics:requested', data);
    });

    // Ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });
  }

  /**
   * Emit event to specific user
   */
  emitToUser(userId: string, event: string, data: any): void {
    if (!this.io) return;

    this.io.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Emit event to campaign subscribers
   */
  emitToCampaign(campaignId: string, event: string, data: any): void {
    if (!this.io) return;

    this.io.to(`campaign:${campaignId}`).emit(event, data);
  }

  /**
   * Emit event to all connected users
   */
  broadcast(event: string, data: any): void {
    if (!this.io) return;

    this.io.emit(event, data);
  }

  /**
   * Get connected users count
   */
  getConnectedUsersCount(): number {
    return this.userSockets.size;
  }

  /**
   * Get user socket IDs
   */
  getUserSocketIds(userId: string): string[] {
    const socketSet = this.userSockets.get(userId);
    return socketSet ? Array.from(socketSet) : [];
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  /**
   * Send metric updates to subscribed users
   */
  async sendMetricUpdates(metrics: any[]): Promise<void> {
    if (!this.io) return;

    // Group metrics by campaign
    const metricsByCampaign = metrics.reduce((acc, metric) => {
      if (!acc[metric.campaignId]) {
        acc[metric.campaignId] = [];
      }
      acc[metric.campaignId].push(metric);
      return acc;
    }, {} as Record<string, any[]>);

    // Send to campaign subscribers
    for (const [campaignId, campaignMetrics] of Object.entries(metricsByCampaign)) {
      this.emitToCampaign(campaignId, 'metrics:update', {
        campaignId,
        metrics: campaignMetrics
      });
    }
  }

  /**
   * Send alert to user
   */
  async sendAlert(userId: string, alert: any): Promise<void> {
    this.emitToUser(userId, 'alert:new', alert);
  }

  /**
   * Store socket connection in Redis
   */
  private async storeSocketConnection(userId: string, socketId: string): Promise<void> {
    try {
      const key = `ws:user:${userId}`;
      await redis.sadd(key, socketId);
      await redis.expire(key, 86400); // 24 hours
    } catch (error) {
      logger.error('Failed to store socket connection', error);
    }
  }

  /**
   * Remove socket connection from Redis
   */
  private async removeSocketConnection(userId: string, socketId: string): Promise<void> {
    try {
      const key = `ws:user:${userId}`;
      await redis.srem(key, socketId);
    } catch (error) {
      logger.error('Failed to remove socket connection', error);
    }
  }

  /**
   * Verify user has access to campaign
   */
  private async verifyUserCampaignAccess(userId: string, campaignId: string): Promise<boolean> {
    // This is a simplified check - in production, query the database
    // to verify the user owns or has access to the campaign
    return true;
  }
}