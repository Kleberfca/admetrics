import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { redisClient, redisPubClient, redisSubClient } from '../config/redis';

interface SocketUser {
  userId: string;
  socketId: string;
  rooms: Set<string>;
}

export class WebSocketService {
  private static instance: WebSocketService;
  private io: SocketIOServer;
  private users: Map<string, SocketUser> = new Map();
  private userSockets: Map<string, Set<string>> = new Map();

  private constructor() {}

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  /**
   * Initialize WebSocket server
   */
  initialize(server: HTTPServer): void {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3001',
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          throw new Error('No token provided');
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        socket.data.userId = decoded.userId;
        next();
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });

    // Connection handler
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    // Redis pub/sub for scaling
    this.setupRedisPubSub();

    logger.info('WebSocket service initialized');
  }

  /**
   * Handle new socket connection
   */
  private handleConnection(socket: Socket): void {
    const userId = socket.data.userId;
    
    logger.info('WebSocket client connected', {
      socketId: socket.id,
      userId
    });

    // Add user to tracking
    this.addUser(userId, socket.id);

    // Join user's personal room
    socket.join(`user:${userId}`);

    // Handle events
    socket.on('subscribe_metrics', (data) => this.handleSubscribeMetrics(socket, data));
    socket.on('unsubscribe_metrics', (data) => this.handleUnsubscribeMetrics(socket, data));
    socket.on('subscribe_campaigns', (data) => this.handleSubscribeCampaigns(socket, data));
    socket.on('subscribe_alerts', () => this.handleSubscribeAlerts(socket));
    
    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });

    // Send connection confirmation
    socket.emit('connected', {
      socketId: socket.id,
      userId
    });
  }

  /**
   * Handle disconnection
   */
  private handleDisconnection(socket: Socket): void {
    const userId = socket.data.userId;
    
    logger.info('WebSocket client disconnected', {
      socketId: socket.id,
      userId
    });

    this.removeUser(userId, socket.id);
  }

  /**
   * Subscribe to metrics updates
   */
  private handleSubscribeMetrics(socket: Socket, data: any): void {
    const { platforms, campaignIds } = data;
    
    // Join platform rooms
    if (platforms && Array.isArray(platforms)) {
      platforms.forEach((platform: string) => {
        socket.join(`metrics:platform:${platform}`);
      });
    }

    // Join campaign rooms
    if (campaignIds && Array.isArray(campaignIds)) {
      campaignIds.forEach((campaignId: string) => {
        socket.join(`metrics:campaign:${campaignId}`);
      });
    }

    socket.emit('subscribed_metrics', { platforms, campaignIds });
  }

  /**
   * Unsubscribe from metrics updates
   */
  private handleUnsubscribeMetrics(socket: Socket, data: any): void {
    const { platforms, campaignIds } = data;
    
    // Leave platform rooms
    if (platforms && Array.isArray(platforms)) {
      platforms.forEach((platform: string) => {
        socket.leave(`metrics:platform:${platform}`);
      });
    }

    // Leave campaign rooms
    if (campaignIds && Array.isArray(campaignIds)) {
      campaignIds.forEach((campaignId: string) => {
        socket.leave(`metrics:campaign:${campaignId}`);
      });
    }

    socket.emit('unsubscribed_metrics', { platforms, campaignIds });
  }

  /**
   * Subscribe to campaign updates
   */
  private handleSubscribeCampaigns(socket: Socket, data: any): void {
    const { campaignIds } = data;
    
    if (campaignIds && Array.isArray(campaignIds)) {
      campaignIds.forEach((campaignId: string) => {
        socket.join(`campaign:${campaignId}`);
      });
    }

    socket.emit('subscribed_campaigns', { campaignIds });
  }

  /**
   * Subscribe to alerts
   */
  private handleSubscribeAlerts(socket: Socket): void {
    const userId = socket.data.userId;
    socket.join(`alerts:${userId}`);
    socket.emit('subscribed_alerts');
  }

  /**
   * Add user tracking
   */
  private addUser(userId: string, socketId: string): void {
    // Track user socket
    const user: SocketUser = {
      userId,
      socketId,
      rooms: new Set()
    };
    this.users.set(socketId, user);

    // Track user's sockets
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);
  }

  /**
   * Remove user tracking
   */
  private removeUser(userId: string, socketId: string): void {
    this.users.delete(socketId);
    
    const userSocketSet = this.userSockets.get(userId);
    if (userSocketSet) {
      userSocketSet.delete(socketId);
      if (userSocketSet.size === 0) {
        this.userSockets.delete(userId);
      }
    }
  }

  /**
   * Setup Redis pub/sub for scaling
   */
  private setupRedisPubSub(): void {
    // Subscribe to Redis channels
    redisSubClient.subscribe('metrics_update');
    redisSubClient.subscribe('campaign_update');
    redisSubClient.subscribe('alert_notification');
    redisSubClient.subscribe('ai_insight');

    // Handle messages
    redisSubClient.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        
        switch (channel) {
          case 'metrics_update':
            this.broadcastMetricsUpdate(data);
            break;
          case 'campaign_update':
            this.broadcastCampaignUpdate(data);
            break;
          case 'alert_notification':
            this.broadcastAlert(data);
            break;
          case 'ai_insight':
            this.broadcastAIInsight(data);
            break;
        }
      } catch (error) {
        logger.error('Error handling Redis message', { channel, error });
      }
    });
  }

  /**
   * Broadcast metrics update
   */
  private broadcastMetricsUpdate(data: any): void {
    const { platform, campaignId, metrics } = data;
    
    if (platform) {
      this.io.to(`metrics:platform:${platform}`).emit('metrics_update', {
        platform,
        metrics,
        timestamp: new Date()
      });
    }

    if (campaignId) {
      this.io.to(`metrics:campaign:${campaignId}`).emit('metrics_update', {
        campaignId,
        metrics,
        timestamp: new Date()
      });
    }
  }

  /**
   * Broadcast campaign update
   */
  private broadcastCampaignUpdate(data: any): void {
    const { campaignId, update } = data;
    
    this.io.to(`campaign:${campaignId}`).emit('campaign_update', {
      campaignId,
      update,
      timestamp: new Date()
    });
  }

  /**
   * Broadcast alert
   */
  private broadcastAlert(data: any): void {
    const { userId, alert } = data;
    
    this.io.to(`alerts:${userId}`).emit('new_alert', {
      alert,
      timestamp: new Date()
    });
  }

  /**
   * Broadcast AI insight
   */
  private broadcastAIInsight(data: any): void {
    const { userId, campaignId, insight } = data;
    
    if (userId) {
      this.io.to(`user:${userId}`).emit('ai_insight', {
        insight,
        timestamp: new Date()
      });
    }

    if (campaignId) {
      this.io.to(`campaign:${campaignId}`).emit('ai_insight', {
        insight,
        timestamp: new Date()
      });
    }
  }

  /**
   * Emit to specific user
   */
  emitToUser(userId: string, event: string, data: any): void {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Emit to room
   */
  emitToRoom(room: string, event: string, data: any): void {
    this.io.to(room).emit(event, data);
  }

  /**
   * Subscribe user to room
   */
  subscribeToRoom(userId: string, room: string): void {
    const socketIds = this.userSockets.get(userId);
    if (socketIds) {
      socketIds.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.join(room);
        }
      });
    }
  }

  /**
   * Unsubscribe user from room
   */
  unsubscribeFromRoom(userId: string, room: string): void {
    const socketIds = this.userSockets.get(userId);
    if (socketIds) {
      socketIds.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.leave(room);
        }
      });
    }
  }

  /**
   * Publish event to Redis
   */
  static async publishEvent(channel: string, data: any): Promise<void> {
    try {
      await redisPubClient.publish(channel, JSON.stringify(data));
    } catch (error) {
      logger.error('Failed to publish event', { channel, error });
    }
  }
}

/**
 * Setup WebSocket handlers
 */
export function setupWebSocketHandlers(io: SocketIOServer): void {
  const wsService = WebSocketService.getInstance();
  // Initialize is called separately with the server instance
}