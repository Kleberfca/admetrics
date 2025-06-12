import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { MetricsService } from './metrics.service';
import { RedisAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

interface AuthenticatedSocket extends Socket {
  userId: string;
  userEmail: string;
}

interface SocketUser {
  userId: string;
  email: string;
  connectedAt: Date;
  lastActivity: Date;
  subscribedChannels: Set<string>;
}

export interface RealTimeMetricsUpdate {
  type: 'metrics_update';
  data: {
    userId: string;
    metrics: any;
    timestamp: Date;
    platforms: string[];
  };
}

export interface CampaignAlert {
  type: 'campaign_alert';
  data: {
    campaignId: string;
    campaignName: string;
    alertType: 'budget_exceeded' | 'performance_drop' | 'anomaly_detected';
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    timestamp: Date;
  };
}

export interface AIInsightUpdate {
  type: 'ai_insight';
  data: {
    insightId: string;
    campaignId: string;
    type: string;
    title: string;
    description: string;
    confidence: number;
    priority: string;
    recommendations: any[];
    timestamp: Date;
  };
}

export class WebSocketService {
  private io: SocketIOServer;
  private metricsService: MetricsService;
  private connectedUsers: Map<string, SocketUser> = new Map();
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> socketIds
  private updateIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(io: SocketIOServer, metricsService: MetricsService) {
    this.io = io;
    this.metricsService = metricsService;
  }

  /**
   * Initialize WebSocket service with Redis adapter for scaling
   */
  async initialize(): Promise<void> {
    try {
      // Setup Redis adapter for multi-instance scaling
      if (process.env.REDIS_URL) {
        const pubClient = createClient({ url: process.env.REDIS_URL });
        const subClient = pubClient.duplicate();
        
        await Promise.all([pubClient.connect(), subClient.connect()]);
        
        this.io.adapter(new RedisAdapter(pubClient, subClient));
        logger.info('WebSocket Redis adapter initialized');
      }

      // Authentication middleware
      this.io.use(this.authenticateSocket.bind(this));

      // Connection event handlers
      this.io.on('connection', this.handleConnection.bind(this));

      // Cleanup disconnected users every 5 minutes
      setInterval(() => {
        this.cleanupDisconnectedUsers();
      }, 5 * 60 * 1000);

      logger.info('WebSocket service initialized');

    } catch (error) {
      logger.error('Failed to initialize WebSocket service:', error);
      throw error;
    }
  }

  /**
   * Authenticate socket connections using JWT
   */
  private async authenticateSocket(socket: Socket, next: (err?: Error) => void): Promise<void> {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      
      (socket as AuthenticatedSocket).userId = decoded.userId;
      (socket as AuthenticatedSocket).userEmail = decoded.email;
      
      next();

    } catch (error) {
      logger.warn(`WebSocket authentication failed: ${error.message}`);
      next(new Error('Invalid authentication token'));
    }
  }

  /**
   * Handle new socket connections
   */
  private handleConnection(socket: AuthenticatedSocket): void {
    const { userId, userEmail } = socket;
    
    logger.info(`User connected: ${userEmail} (${userId}) - Socket: ${socket.id}`);

    // Track user connection
    this.addConnectedUser(userId, userEmail, socket.id);

    // Join user-specific room
    socket.join(`user:${userId}`);

    // Event handlers
    socket.on('subscribe_metrics', (data) => this.handleSubscribeMetrics(socket, data));
    socket.on('unsubscribe_metrics', (data) => this.handleUnsubscribeMetrics(socket, data));
    socket.on('subscribe_campaign', (data) => this.handleSubscribeCampaign(socket, data));
    socket.on('unsubscribe_campaign', (data) => this.handleUnsubscribeCampaign(socket, data));
    socket.on('request_real_time_data', (data) => this.handleRealTimeDataRequest(socket, data));
    socket.on('ping', () => this.handlePing(socket));
    socket.on('disconnect', () => this.handleDisconnection(socket));

    // Send initial connection data
    socket.emit('connected', {
      message: 'Connected to AdMetrics real-time service',
      userId,
      timestamp: new Date()
    });

    // Start real-time updates if user has active subscriptions
    this.startRealTimeUpdates(userId);
  }

  /**
   * Handle metrics subscription
   */
  private handleSubscribeMetrics(socket: AuthenticatedSocket, data: any): void {
    const { platforms = [], updateInterval = 30000 } = data;
    const channel = `metrics:${socket.userId}:${platforms.join(',')}`;
    
    socket.join(channel);
    
    const user = this.connectedUsers.get(socket.userId);
    if (user) {
      user.subscribedChannels.add(channel);
      user.lastActivity = new Date();
    }

    logger.info(`User ${socket.userId} subscribed to metrics: ${platforms.join(', ')}`);

    // Send initial metrics data
    this.sendRealTimeMetrics(socket.userId, platforms);

    // Setup periodic updates
    this.setupPeriodicUpdates(socket.userId, platforms, updateInterval);

    socket.emit('subscription_confirmed', {
      type: 'metrics',
      channel,
      platforms,
      updateInterval
    });
  }

  /**
   * Handle metrics unsubscription
   */
  private handleUnsubscribeMetrics(socket: AuthenticatedSocket, data: any): void {
    const { platforms = [] } = data;
    const channel = `metrics:${socket.userId}:${platforms.join(',')}`;
    
    socket.leave(channel);
    
    const user = this.connectedUsers.get(socket.userId);
    if (user) {
      user.subscribedChannels.delete(channel);
      user.lastActivity = new Date();
    }

    // Clear periodic updates if no more subscriptions
    if (!user?.subscribedChannels.size) {
      this.clearPeriodicUpdates(socket.userId);
    }

    logger.info(`User ${socket.userId} unsubscribed from metrics: ${platforms.join(', ')}`);

    socket.emit('unsubscription_confirmed', {
      type: 'metrics',
      channel,
      platforms
    });
  }

  /**
   * Handle campaign subscription
   */
  private handleSubscribeCampaign(socket: AuthenticatedSocket, data: any): void {
    const { campaignId } = data;
    const channel = `campaign:${campaignId}`;
    
    socket.join(channel);
    
    const user = this.connectedUsers.get(socket.userId);
    if (user) {
      user.subscribedChannels.add(channel);
      user.lastActivity = new Date();
    }

    logger.info(`User ${socket.userId} subscribed to campaign: ${campaignId}`);

    socket.emit('subscription_confirmed', {
      type: 'campaign',
      channel,
      campaignId
    });
  }

  /**
   * Handle campaign unsubscription
   */
  private handleUnsubscribeCampaign(socket: AuthenticatedSocket, data: any): void {
    const { campaignId } = data;
    const channel = `campaign:${campaignId}`;
    
    socket.leave(channel);
    
    const user = this.connectedUsers.get(socket.userId);
    if (user) {
      user.subscribedChannels.delete(channel);
      user.lastActivity = new Date();
    }

    logger.info(`User ${socket.userId} unsubscribed from campaign: ${campaignId}`);

    socket.emit('unsubscription_confirmed', {
      type: 'campaign',
      channel,
      campaignId
    });
  }

  /**
   * Handle real-time data requests
   */
  private async handleRealTimeDataRequest(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      const { type, params } = data;
      
      switch (type) {
        case 'dashboard_metrics':
          const metrics = await this.metricsService.getRealTimeMetrics(
            socket.userId, 
            params.platforms || []
          );
          socket.emit('real_time_data', { type, data: metrics });
          break;
          
        case 'campaign_performance':
          // Implement campaign-specific real-time data
          break;
          
        default:
          socket.emit('error', { message: `Unknown data type: ${type}` });
      }
      
    } catch (error) {
      logger.error(`Error handling real-time data request: ${error.message}`);
      socket.emit('error', { message: 'Failed to fetch real-time data' });
    }
  }

  /**
   * Handle ping for connection health
   */
  private handlePing(socket: AuthenticatedSocket): void {
    const user = this.connectedUsers.get(socket.userId);
    if (user) {
      user.lastActivity = new Date();
    }
    
    socket.emit('pong', { timestamp: new Date() });
  }

  /**
   * Handle socket disconnection
   */
  private handleDisconnection(socket: AuthenticatedSocket): void {
    logger.info(`User disconnected: ${socket.userEmail} (${socket.userId}) - Socket: ${socket.id}`);
    
    this.removeSocketFromUser(socket.userId, socket.id);
    
    // Clear updates if no more connections for this user
    if (!this.hasActiveConnections(socket.userId)) {
      this.clearPeriodicUpdates(socket.userId);
    }
  }

  /**
   * Broadcast metrics update to subscribed users
   */
  async broadcastMetricsUpdate(update: RealTimeMetricsUpdate): Promise<void> {
    const { userId, platforms } = update.data;
    const channel = `metrics:${userId}:${platforms.join(',')}`;
    
    this.io.to(channel).emit('metrics_update', update);
    
    logger.debug(`Broadcasted metrics update to channel: ${channel}`);
  }

  /**
   * Broadcast campaign alert
   */
  async broadcastCampaignAlert(alert: CampaignAlert): Promise<void> {
    const { campaignId } = alert.data;
    const channel = `campaign:${campaignId}`;
    
    this.io.to(channel).emit('campaign_alert', alert);
    
    logger.info(`Broadcasted campaign alert: ${alert.data.alertType} for campaign ${campaignId}`);
  }

  /**
   * Broadcast AI insight update
   */
  async broadcastAIInsight(insight: AIInsightUpdate): Promise<void> {
    const { campaignId } = insight.data;
    const channel = `campaign:${campaignId}`;
    
    this.io.to(channel).emit('ai_insight', insight);
    
    logger.info(`Broadcasted AI insight: ${insight.data.type} for campaign ${campaignId}`);
  }

  /**
   * Send notification to specific user
   */
  async sendUserNotification(userId: string, notification: any): Promise<void> {
    this.io.to(`user:${userId}`).emit('notification', notification);
  }

  /**
   * Get connected users count
   */
  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  /**
   * Get user connection status
   */
  isUserConnected(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  // Private helper methods

  private addConnectedUser(userId: string, email: string, socketId: string): void {
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, {
        userId,
        email,
        connectedAt: new Date(),
        lastActivity: new Date(),
        subscribedChannels: new Set()
      });
    }

    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    
    this.userSockets.get(userId)!.add(socketId);
  }

  private removeSocketFromUser(userId: string, socketId: string): void {
    const userSocketSet = this.userSockets.get(userId);
    if (userSocketSet) {
      userSocketSet.delete(socketId);
      
      if (userSocketSet.size === 0) {
        this.userSockets.delete(userId);
        this.connectedUsers.delete(userId);
      }
    }
  }

  private hasActiveConnections(userId: string): boolean {
    const userSocketSet = this.userSockets.get(userId);
    return userSocketSet ? userSocketSet.size > 0 : false;
  }

  private async sendRealTimeMetrics(userId: string, platforms: string[]): Promise<void> {
    try {
      const metrics = await this.metricsService.getRealTimeMetrics(userId, platforms);
      
      if (metrics) {
        const update: RealTimeMetricsUpdate = {
          type: 'metrics_update',
          data: {
            userId,
            metrics,
            timestamp: new Date(),
            platforms
          }
        };
        
        await this.broadcastMetricsUpdate(update);
      }
      
    } catch (error) {
      logger.error(`Error sending real-time metrics to user ${userId}:`, error);
    }
  }

  private setupPeriodicUpdates(userId: string, platforms: string[], interval: number): void {
    // Clear existing interval
    this.clearPeriodicUpdates(userId);
    
    const intervalId = setInterval(async () => {
      if (this.hasActiveConnections(userId)) {
        await this.sendRealTimeMetrics(userId, platforms);
      } else {
        this.clearPeriodicUpdates(userId);
      }
    }, interval);
    
    this.updateIntervals.set(userId, intervalId);
  }

  private clearPeriodicUpdates(userId: string): void {
    const intervalId = this.updateIntervals.get(userId);
    if (intervalId) {
      clearInterval(intervalId);
      this.updateIntervals.delete(userId);
    }
  }

  private startRealTimeUpdates(userId: string): void {
    // Start with default platforms if user has existing subscriptions
    const defaultPlatforms = ['GOOGLE_ADS', 'FACEBOOK_ADS'];
    this.setupPeriodicUpdates(userId, defaultPlatforms, 30000); // 30 seconds
  }

  private cleanupDisconnectedUsers(): void {
    const now = new Date();
    const timeout = 10 * 60 * 1000; // 10 minutes

    for (const [userId, user] of this.connectedUsers) {
      if (now.getTime() - user.lastActivity.getTime() > timeout) {
        logger.info(`Cleaning up inactive user: ${userId}`);
        this.connectedUsers.delete(userId);
        this.clearPeriodicUpdates(userId);
      }
    }
  }
}