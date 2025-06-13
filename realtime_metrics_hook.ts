import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './useAuth';
import { apiService } from '../services/api.service';
import toast from 'react-hot-toast';

interface RealTimeMetrics {
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  timestamp: Date;
  platform: string;
  campaignId: string;
}

interface MetricsUpdate {
  campaignId: string;
  platform: string;
  metrics: Partial<RealTimeMetrics>;
  change: {
    spend: number;
    clicks: number;
    conversions: number;
  };
}

interface UseRealTimeMetricsOptions {
  enabled?: boolean;
  campaignIds?: string[];
  platforms?: string[];
  updateInterval?: number;
  reconnectAttempts?: number;
}

interface ConnectionStatus {
  connected: boolean;
  lastUpdate: Date | null;
  error: string | null;
  reconnectAttempts: number;
}

export const useRealTimeMetrics = (options: UseRealTimeMetricsOptions = {}) => {
  const {
    enabled = true,
    campaignIds = [],
    platforms = [],
    updateInterval = 30000, // 30 seconds
    reconnectAttempts = 5,
  } = options;

  const { user, isAuthenticated } = useAuth();
  const [metrics, setMetrics] = useState<Record<string, RealTimeMetrics>>({});
  const [updates, setUpdates] = useState<MetricsUpdate[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false,
    lastUpdate: null,
    error: null,
    reconnectAttempts: 0,
  });

  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize WebSocket connection
  const initializeSocket = useCallback(() => {
    if (!isAuthenticated || !enabled) return;

    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      const socket = io(process.env.REACT_APP_WS_URL || 'http://localhost:3000', {
        auth: { token },
        transports: ['websocket', 'polling'],
        timeout: 20000,
      });

      socketRef.current = socket;

      // Connection events
      socket.on('connect', () => {
        setConnectionStatus(prev => ({
          ...prev,
          connected: true,
          error: null,
          reconnectAttempts: 0,
        }));

        // Subscribe to metrics updates
        socket.emit('subscribe:metrics', {
          campaignIds,
          platforms,
          userId: user?.id,
        });
      });

      socket.on('disconnect', (reason) => {
        setConnectionStatus(prev => ({
          ...prev,
          connected: false,
          error: `Disconnected: ${reason}`,
        }));

        // Attempt to reconnect if not manually disconnected
        if (reason !== 'io client disconnect') {
          scheduleReconnect();
        }
      });

      socket.on('connect_error', (error) => {
        setConnectionStatus(prev => ({
          ...prev,
          connected: false,
          error: error.message,
        }));
        scheduleReconnect();
      });

      // Metrics events
      socket.on('metrics:update', (update: MetricsUpdate) => {
        handleMetricsUpdate(update);
      });

      socket.on('metrics:batch', (batchUpdates: MetricsUpdate[]) => {
        batchUpdates.forEach(handleMetricsUpdate);
      });

      socket.on('metrics:alert', (alert: any) => {
        handleMetricsAlert(alert);
      });

      // Campaign events
      socket.on('campaign:status', (data: any) => {
        toast.info(`Campaign ${data.name} status changed to ${data.status}`);
      });

      socket.on('integration:sync', (data: any) => {
        toast.info(`${data.platform} integration sync completed`);
      });

    } catch (error) {
      console.error('Socket initialization error:', error);
      setConnectionStatus(prev => ({
        ...prev,
        error: 'Failed to initialize connection',
      }));
    }
  }, [isAuthenticated, enabled, campaignIds, platforms, user?.id]);

  // Handle reconnection
  const scheduleReconnect = useCallback(() => {
    if (connectionStatus.reconnectAttempts >= reconnectAttempts) {
      setConnectionStatus(prev => ({
        ...prev,
        error: 'Maximum reconnection attempts reached',
      }));
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, connectionStatus.reconnectAttempts), 30000);
    
    reconnectTimeoutRef.current = setTimeout(() => {
      setConnectionStatus(prev => ({
        ...prev,
        reconnectAttempts: prev.reconnectAttempts + 1,
      }));
      
      initializeSocket();
    }, delay);
  }, [connectionStatus.reconnectAttempts, reconnectAttempts, initializeSocket]);

  // Handle metrics updates
  const handleMetricsUpdate = useCallback((update: MetricsUpdate) => {
    const key = `${update.campaignId}-${update.platform}`;
    
    setMetrics(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        ...update.metrics,
        timestamp: new Date(),
      } as RealTimeMetrics,
    }));

    setUpdates(prev => [update, ...prev.slice(0, 99)]); // Keep last 100 updates

    setConnectionStatus(prev => ({
      ...prev,
      lastUpdate: new Date(),
    }));
  }, []);

  // Handle metrics alerts
  const handleMetricsAlert = useCallback((alert: any) => {
    const { type, message, severity, data } = alert;
    
    switch (severity) {
      case 'critical':
        toast.error(message, { duration: 8000 });
        break;
      case 'warning':
        toast((t) => (
          <div className="flex items-center space-x-2">
            <span className="text-yellow-600">⚠️</span>
            <span>{message}</span>
          </div>
        ), { duration: 6000 });
        break;
      case 'info':
        toast.success(message, { duration: 4000 });
        break;
      default:
        toast(message);
    }
  }, []);

  // Fetch initial metrics data
  const fetchInitialMetrics = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const query = {
        campaignIds: campaignIds.length > 0 ? campaignIds.join(',') : undefined,
        platforms: platforms.length > 0 ? platforms.join(',') : undefined,
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Last 24 hours
        endDate: new Date().toISOString(),
      };

      const data = await apiService.getMetrics(query);
      
      // Transform and set initial metrics
      const metricsMap: Record<string, RealTimeMetrics> = {};
      data.forEach((metric: any) => {
        const key = `${metric.campaignId}-${metric.platform}`;
        metricsMap[key] = {
          spend: metric.spend || 0,
          clicks: metric.clicks || 0,
          impressions: metric.impressions || 0,
          conversions: metric.conversions || 0,
          timestamp: new Date(metric.date),
          platform: metric.platform,
          campaignId: metric.campaignId,
        };
      });

      setMetrics(metricsMap);
    } catch (error) {
      console.error('Failed to fetch initial metrics:', error);
    }
  }, [isAuthenticated, campaignIds, platforms]);

  // Manual refresh
  const refresh = useCallback(async () => {
    await fetchInitialMetrics();
    
    if (socketRef.current?.connected) {
      socketRef.current.emit('metrics:refresh', {
        campaignIds,
        platforms,
        userId: user?.id,
      });
    }
  }, [fetchInitialMetrics, campaignIds, platforms, user?.id]);

  // Subscribe to specific campaigns
  const subscribeToCampaigns = useCallback((newCampaignIds: string[]) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe:campaigns', {
        campaignIds: newCampaignIds,
        userId: user?.id,
      });
    }
  }, [user?.id]);

  // Unsubscribe from campaigns
  const unsubscribeFromCampaigns = useCallback((campaignIds: string[]) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('unsubscribe:campaigns', {
        campaignIds,
        userId: user?.id,
      });
    }
  }, [user?.id]);

  // Get metrics for specific campaign
  const getCampaignMetrics = useCallback((campaignId: string, platform?: string) => {
    if (platform) {
      const key = `${campaignId}-${platform}`;
      return metrics[key] || null;
    }
    
    // Return all platforms for this campaign
    return Object.entries(metrics)
      .filter(([key]) => key.startsWith(`${campaignId}-`))
      .map(([, metric]) => metric);
  }, [metrics]);

  // Get aggregated metrics
  const getAggregatedMetrics = useCallback(() => {
    const allMetrics = Object.values(metrics);
    
    return allMetrics.reduce(
      (acc, metric) => ({
        totalSpend: acc.totalSpend + metric.spend,
        totalClicks: acc.totalClicks + metric.clicks,
        totalImpressions: acc.totalImpressions + metric.impressions,
        totalConversions: acc.totalConversions + metric.conversions,
        activeCampaigns: acc.activeCampaigns.add(metric.campaignId).size,
        lastUpdate: metric.timestamp > acc.lastUpdate ? metric.timestamp : acc.lastUpdate,
      }),
      {
        totalSpend: 0,
        totalClicks: 0,
        totalImpressions: 0,
        totalConversions: 0,
        activeCampaigns: new Set(),
        lastUpdate: new Date(0),
      }
    );
  }, [metrics]);

  // Clear old updates
  const clearUpdates = useCallback(() => {
    setUpdates([]);
  }, []);

  // Initialize
  useEffect(() => {
    if (enabled && isAuthenticated) {
      fetchInitialMetrics();
      initializeSocket();
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [enabled, isAuthenticated, initializeSocket, fetchInitialMetrics]);

  // Update subscriptions when dependencies change
  useEffect(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('update:subscription', {
        campaignIds,
        platforms,
        userId: user?.id,
      });
    }
  }, [campaignIds, platforms, user?.id]);

  return {
    metrics,
    updates,
    connectionStatus,
    getCampaignMetrics,
    getAggregatedMetrics,
    subscribeToCampaigns,
    unsubscribeFromCampaigns,
    refresh,
    clearUpdates,
    isConnected: connectionStatus.connected,
    isEnabled: enabled,
  };
};

export default useRealTimeMetrics;