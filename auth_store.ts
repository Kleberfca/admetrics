// frontend/src/store/auth.store.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { User } from '../types/auth.types';

interface AuthState {
  // State
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  lastLoginAt: Date | null;
  
  // User preferences (cached)
  preferences: {
    theme: 'light' | 'dark' | 'system';
    language: string;
    timezone: string;
    defaultDateRange: string;
    dashboardLayout: any;
    notifications: {
      email: boolean;
      push: boolean;
      alerts: boolean;
      reports: boolean;
    };
  };
  
  // Session info
  sessionInfo: {
    loginCount: number;
    lastActivity: Date | null;
    ipAddress: string | null;
    userAgent: string | null;
  };
}

interface AuthActions {
  // Authentication actions
  setUser: (user: User) => void;
  setTokens: (token: string, refreshToken: string) => void;
  clearAuth: () => void;
  setInitialized: (initialized: boolean) => void;
  
  // User preferences
  updatePreferences: (preferences: Partial<AuthState['preferences']>) => void;
  resetPreferences: () => void;
  
  // Session management
  updateSessionInfo: (info: Partial<AuthState['sessionInfo']>) => void;
  trackActivity: () => void;
  
  // Utilities
  getToken: () => string | null;
  isTokenExpired: () => boolean;
  hasRole: (role: string) => boolean;
  hasPermission: (permission: string) => boolean;
}

type AuthStore = AuthState & AuthActions;

// Default preferences
const defaultPreferences: AuthState['preferences'] = {
  theme: 'system',
  language: 'en',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  defaultDateRange: 'last30days',
  dashboardLayout: null,
  notifications: {
    email: true,
    push: true,
    alerts: true,
    reports: true
  }
};

// Default session info
const defaultSessionInfo: AuthState['sessionInfo'] = {
  loginCount: 0,
  lastActivity: null,
  ipAddress: null,
  userAgent: null
};

// JWT token utilities
const isTokenExpired = (token: string | null): boolean => {
  if (!token) return true;
  
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const currentTime = Date.now() / 1000;
    return payload.exp < currentTime;
  } catch (error) {
    return true;
  }
};

const getTokenPayload = (token: string | null): any => {
  if (!token) return null;
  
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (error) {
    return null;
  }
};

export const useAuthStore = create<AuthStore>()(
  persist(
    immer((set, get) => ({
      // Initial state
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isInitialized: false,
      lastLoginAt: null,
      preferences: defaultPreferences,
      sessionInfo: defaultSessionInfo,

      // Authentication actions
      setUser: (user: User) => {
        set((state) => {
          state.user = user;
          state.isAuthenticated = true;
          state.lastLoginAt = new Date();
          
          // Update preferences from user data
          if (user.preferences) {
            state.preferences = { ...state.preferences, ...user.preferences };
          }
          
          if (user.timezone) {
            state.preferences.timezone = user.timezone;
          }
          
          if (user.language) {
            state.preferences.language = user.language;
          }
          
          // Track login
          state.sessionInfo.loginCount += 1;
          state.sessionInfo.lastActivity = new Date();
          
          // Get browser info
          if (typeof window !== 'undefined') {
            state.sessionInfo.userAgent = navigator.userAgent;
            // Note: Getting IP address requires server-side implementation
          }
        });
      },

      setTokens: (token: string, refreshToken: string) => {
        set((state) => {
          state.token = token;
          state.refreshToken = refreshToken;
          state.isAuthenticated = true;
        });
      },

      clearAuth: () => {
        set((state) => {
          state.user = null;
          state.token = null;
          state.refreshToken = null;
          state.isAuthenticated = false;
          state.lastLoginAt = null;
          // Keep preferences and session info for next login
        });
      },

      setInitialized: (initialized: boolean) => {
        set((state) => {
          state.isInitialized = initialized;
        });
      },

      // User preferences
      updatePreferences: (newPreferences: Partial<AuthState['preferences']>) => {
        set((state) => {
          state.preferences = { ...state.preferences, ...newPreferences };
        });
      },

      resetPreferences: () => {
        set((state) => {
          state.preferences = defaultPreferences;
        });
      },

      // Session management
      updateSessionInfo: (info: Partial<AuthState['sessionInfo']>) => {
        set((state) => {
          state.sessionInfo = { ...state.sessionInfo, ...info };
        });
      },

      trackActivity: () => {
        set((state) => {
          state.sessionInfo.lastActivity = new Date();
        });
      },

      // Utilities
      getToken: () => {
        const { token } = get();
        return token && !isTokenExpired(token) ? token : null;
      },

      isTokenExpired: () => {
        const { token } = get();
        return isTokenExpired(token);
      },

      hasRole: (role: string) => {
        const { user } = get();
        if (!user) return false;
        return user.role === role || user.role === 'ADMIN';
      },

      hasPermission: (permission: string) => {
        const { user } = get();
        if (!user) return false;
        
        // Admin has all permissions
        if (user.role === 'ADMIN') return true;
        
        // Check user permissions
        const userPermissions = user.permissions || [];
        return userPermissions.includes(permission);
      }
    })),
    {
      name: 'admetrics-auth',
      storage: createJSONStorage(() => localStorage),
      
      // Only persist certain fields
      partialize: (state) => ({
        preferences: state.preferences,
        sessionInfo: {
          loginCount: state.sessionInfo.loginCount,
          lastActivity: state.sessionInfo.lastActivity
        },
        lastLoginAt: state.lastLoginAt
      }),
      
      // Handle rehydration
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Check if tokens exist in localStorage but not in persisted state
          const token = localStorage.getItem('token');
          const refreshToken = localStorage.getItem('refreshToken');
          
          if (token && refreshToken && !state.token) {
            // Tokens exist but weren't persisted, need to re-authenticate
            state.token = token;
            state.refreshToken = refreshToken;
          }
          
          // Validate token
          if (state.token && isTokenExpired(state.token)) {
            // Token expired, clear auth
            state.token = null;
            state.refreshToken = null;
            state.user = null;
            state.isAuthenticated = false;
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
          }
        }
      }
    }
  )
);

// Selectors for common use cases
export const useAuthUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useAuthPreferences = () => useAuthStore((state) => state.preferences);
export const useAuthToken = () => useAuthStore((state) => state.getToken());

// Activity tracking hook
export const useActivityTracker = () => {
  const trackActivity = useAuthStore((state) => state.trackActivity);
  
  // Track activity on user interactions
  React.useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    
    let throttleTimer: NodeJS.Timeout | null = null;
    
    const handleActivity = () => {
      if (throttleTimer) return;
      
      throttleTimer = setTimeout(() => {
        trackActivity();
        throttleTimer = null;
      }, 5000); // Throttle to once every 5 seconds
    };
    
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });
    
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      
      if (throttleTimer) {
        clearTimeout(throttleTimer);
      }
    };
  }, [trackActivity]);
};

// Auto-logout on inactivity
export const useAutoLogout = (timeoutMinutes: number = 60) => {
  const { lastActivity } = useAuthStore((state) => state.sessionInfo);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  
  React.useEffect(() => {
    if (!isAuthenticated || !lastActivity) return;
    
    const checkInactivity = () => {
      const now = new Date();
      const timeDiff = now.getTime() - new Date(lastActivity).getTime();
      const minutesDiff = timeDiff / (1000 * 60);
      
      if (minutesDiff > timeoutMinutes) {
        clearAuth();
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        
        // Show notification
        if (typeof window !== 'undefined' && window.location.pathname !== '/auth/login') {
          alert('Session expired due to inactivity. Please log in again.');
          window.location.href = '/auth/login';
        }
      }
    };
    
    const interval = setInterval(checkInactivity, 60000); // Check every minute
    
    return () => clearInterval(interval);
  }, [lastActivity, isAuthenticated, timeoutMinutes, clearAuth]);
};

export default useAuthStore;