/**
 * WebSocket hook for real-time updates
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'react-toastify';

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}

interface UseWebSocketOptions {
  autoConnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

export const useWebSocket = (options: UseWebSocketOptions = {}) => {
  const {
    autoConnect = true,
    reconnectInterval = 5000,
    maxReconnectAttempts = 5,
    onMessage,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  const { data: session } = useSession();
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!session?.accessToken || ws.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000'}/ws?token=${session.accessToken}`;

    try {
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setReconnectAttempts(0);
        onConnect?.();

        // Start heartbeat
        heartbeatInterval.current = setInterval(() => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          // Handle different message types
          switch (message.type) {
            case 'notification':
              handleNotification(message.data);
              break;
            case 'metric_update':
              handleMetricUpdate(message.data);
              break;
            case 'alert':
              handleAlert(message.data);
              break;
            case 'pong':
              // Heartbeat response
              break;
            default:
              onMessage?.(message);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.current.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        onDisconnect?.();

        // Clear heartbeat
        if (heartbeatInterval.current) {
          clearInterval(heartbeatInterval.current);
        }

        // Attempt reconnection
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectTimeout.current = setTimeout(() => {
            setReconnectAttempts((prev) => prev + 1);
            connect();
          }, reconnectInterval);
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        onError?.(error);
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
    }
  }, [session, reconnectAttempts, maxReconnectAttempts, reconnectInterval, onConnect, onDisconnect, onError, onMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
    }

    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
    }

    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }

    setIsConnected(false);
  }, []);

  const sendMessage = useCallback((type: string, data: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type,
        data,
        timestamp: new Date().toISOString(),
      }));
      return true;
    }
    return false;
  }, []);

  const subscribe = useCallback((channel: string) => {
    return sendMessage('subscribe', { channel });
  }, [sendMessage]);

  const unsubscribe = useCallback((channel: string) => {
    return sendMessage('unsubscribe', { channel });
  }, [sendMessage]);

  // Message handlers
  const handleNotification = (data: any) => {
    // Update notification count in UI
    if (window.updateNotificationCount) {
      window.updateNotificationCount(data.unread_count);
    }

    // Show toast notification
    switch (data.priority) {
      case 'critical':
        toast.error(data.message, { autoClose: false });
        break;
      case 'high':
        toast.warning(data.message);
        break;
      default:
        toast.info(data.message);
    }
  };

  const handleMetricUpdate = (data: any) => {
    // Dispatch Redux action or update context
    if (window.updateDashboardMetrics) {
      window.updateDashboardMetrics(data);
    }
  };

  const handleAlert = (data: any) => {
    // Show alert notification
    toast.error(`Alert: ${data.title}`, {
      description: data.description,
      autoClose: false,
    });

    // Update alerts in UI
    if (window.addAlert) {
      window.addAlert(data);
    }
  };

  // Auto-connect when session is available
  useEffect(() => {
    if (autoConnect && session?.accessToken) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, session, connect, disconnect]);

  return {
    isConnected,
    connect,
    disconnect,
    sendMessage,
    subscribe,
    unsubscribe,
  };
};

// Typed WebSocket hooks for specific features
export const useCampaignUpdates = (campaignId: string) => {
  const { subscribe, unsubscribe, isConnected } = useWebSocket({
    onMessage: (message) => {
      if (message.type === 'campaign_update' && message.data.campaign_id === campaignId) {
        // Handle campaign-specific updates
        if (window.updateCampaignData) {
          window.updateCampaignData(message.data);
        }
      }
    },
  });

  useEffect(() => {
    if (isConnected && campaignId) {
      subscribe(`campaign:${campaignId}`);
      
      return () => {
        unsubscribe(`campaign:${campaignId}`);
      };
    }
  }, [isConnected, campaignId, subscribe, unsubscribe]);
};

export const useDashboardUpdates = () => {
  const { subscribe, unsubscribe, isConnected } = useWebSocket({
    onMessage: (message) => {
      if (message.type === 'dashboard_update') {
        // Handle dashboard updates
        if (window.refreshDashboard) {
          window.refreshDashboard(message.data);
        }
      }
    },
  });

  useEffect(() => {
    if (isConnected) {
      subscribe('dashboard:updates');
      
      return () => {
        unsubscribe('dashboard:updates');
      };
    }
  }, [isConnected, subscribe, unsubscribe]);
};

// Type declarations for global functions
declare global {
  interface Window {
    updateNotificationCount?: (count: number) => void;
    updateDashboardMetrics?: (metrics: any) => void;
    addAlert?: (alert: any) => void;
    updateCampaignData?: (data: any) => void;
    refreshDashboard?: (data: any) => void;
  }
}