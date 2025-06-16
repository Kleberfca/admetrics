import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { websocketService } from '@/services/websocket.service';
import { toast } from 'react-toastify';

interface SocketContextValue {
  isConnected: boolean;
  subscribeToCampaign: (campaignId: string) => void;
  unsubscribeFromCampaign: (campaignId: string) => void;
  subscribeToMetrics: (type: string, campaignIds?: string[]) => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};

interface SocketProviderProps {
  children: React.ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const { data: session } = useSession();
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const [isConnected, setIsConnected] = React.useState(false);

  useEffect(() => {
    if (session?.accessToken) {
      // Connect to WebSocket
      websocketService.connect(session.accessToken);

      // Set up connection status monitoring
      const checkConnection = () => {
        const connected = websocketService.isConnected();
        setIsConnected(connected);

        if (!connected && session?.accessToken) {
          // Attempt to reconnect
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(() => {
            websocketService.connect(session.accessToken);
          }, 5000);
        }
      };

      // Check connection status periodically
      const interval = setInterval(checkConnection, 10000);
      checkConnection();

      // Clean up on unmount
      return () => {
        clearInterval(interval);
        clearTimeout(reconnectTimeoutRef.current);
        websocketService.disconnect();
      };
    }
  }, [session?.accessToken]);

  // Handle connection events
  useEffect(() => {
    const socket = websocketService.getSocket();
    if (!socket) return;

    const handleConnect = () => {
      setIsConnected(true);
      toast.success('Real-time updates connected', { 
        toastId: 'socket-connected',
        autoClose: 2000 
      });
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      toast.warning('Real-time updates disconnected', { 
        toastId: 'socket-disconnected',
        autoClose: 3000 
      });
    };

    const handleError = (error: any) => {
      console.error('WebSocket error:', error);
      toast.error('Connection error. Retrying...', { 
        toastId: 'socket-error',
        autoClose: 3000 
      });
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('error', handleError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('error', handleError);
    };
  }, [websocketService.getSocket()]);

  const value: SocketContextValue = {
    isConnected,
    subscribeToCampaign: websocketService.subscribeToCampaign.bind(websocketService),
    unsubscribeFromCampaign: websocketService.unsubscribeFromCampaign.bind(websocketService),
    subscribeToMetrics: websocketService.subscribeToMetrics.bind(websocketService)
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};