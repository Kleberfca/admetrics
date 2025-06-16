import { io, Socket } from 'socket.io-client';
import { store } from '@/store';
import { updateMetrics } from '@/store/slices/metricsSlice';
import { addAlert } from '@/store/slices/alertsSlice';
import { updateCampaignStatus } from '@/store/slices/campaignsSlice';

class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  connect(token: string): void {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3000', {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay
    });

    this.setupEventListeners();
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.reconnectAttempts++;
    });

    // Business events
    this.socket.on('metrics:update', (data) => {
      store.dispatch(updateMetrics(data));
    });

    this.socket.on('alert:new', (alert) => {
      store.dispatch(addAlert(alert));
    });

    this.socket.on('campaign:updated', (data) => {
      store.dispatch(updateCampaignStatus(data));
    });

    // Subscription confirmations
    this.socket.on('subscribed:campaign', (data) => {
      console.log('Subscribed to campaign:', data.campaignId);
    });

    this.socket.on('subscribed:metrics', (data) => {
      console.log('Subscribed to metrics:', data.room);
    });
  }

  // Public methods
  subscribeToCampaign(campaignId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('subscribe:campaign', campaignId);
    }
  }

  unsubscribeFromCampaign(campaignId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('unsubscribe:campaign', campaignId);
    }
  }

  subscribeToMetrics(type: string, campaignIds?: string[]): void {
    if (this.socket?.connected) {
      this.socket.emit('subscribe:metrics', { type, campaignIds });
    }
  }

  requestMetricsUpdate(campaignIds: string[], metrics: string[]): void {
    if (this.socket?.connected) {
      this.socket.emit('request:metrics', { campaignIds, metrics });
    }
  }

  ping(): void {
    if (this.socket?.connected) {
      this.socket.emit('ping');
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getSocket(): Socket | null {
    return this.socket;
  }
}

export const websocketService = new WebSocketService();