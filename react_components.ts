// frontend/src/components/metrics/MetricCard.tsx
import React from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/outline';

export interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeType?: 'increase' | 'decrease';
  icon: React.ComponentType<{ className?: string }>;
  color?: 'blue' | 'green' | 'purple' | 'yellow' | 'red';
  loading?: boolean;
  className?: string;
}

const colorClasses = {
  blue: {
    bg: 'bg-blue-50',
    icon: 'text-blue-600',
    border: 'border-blue-200'
  },
  green: {
    bg: 'bg-green-50',
    icon: 'text-green-600',
    border: 'border-green-200'
  },
  purple: {
    bg: 'bg-purple-50',
    icon: 'text-purple-600',
    border: 'border-purple-200'
  },
  yellow: {
    bg: 'bg-yellow-50',
    icon: 'text-yellow-600',
    border: 'border-yellow-200'
  },
  red: {
    bg: 'bg-red-50',
    icon: 'text-red-600',
    border: 'border-red-200'
  }
};

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  change,
  changeType,
  icon: Icon,
  color = 'blue',
  loading = false,
  className
}) => {
  const colors = colorClasses[color];

  if (loading) {
    return (
      <div className={clsx('bg-white rounded-lg shadow-sm border border-gray-200 p-6', className)}>
        <div className="animate-pulse">
          <div className="flex items-center">
            <div className={clsx('p-2 rounded-lg', colors.bg)}>
              <div className="h-6 w-6 bg-gray-300 rounded"></div>
            </div>
            <div className="ml-4">
              <div className="h-4 bg-gray-300 rounded w-20 mb-2"></div>
              <div className="h-6 bg-gray-300 rounded w-16"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        'bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow',
        className
      )}
    >
      <div className="flex items-center">
        <div className={clsx('p-2 rounded-lg', colors.bg, colors.border)}>
          <Icon className={clsx('h-6 w-6', colors.icon)} />
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <div className="flex items-center">
            <p className="text-2xl font-semibold text-gray-900">{value}</p>
            {change !== undefined && (
              <div className="ml-2 flex items-center">
                {changeType === 'increase' ? (
                  <ArrowUpIcon className="h-4 w-4 text-green-500" />
                ) : (
                  <ArrowDownIcon className="h-4 w-4 text-red-500" />
                )}
                <span
                  className={clsx(
                    'text-sm font-medium ml-1',
                    changeType === 'increase' ? 'text-green-600' : 'text-red-600'
                  )}
                >
                  {Math.abs(change)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default MetricCard;

---

// frontend/src/components/charts/PerformanceChart.tsx
import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { format } from 'date-fns';

export interface PerformanceChartProps {
  data: Array<{
    date: string;
    spend?: number;
    clicks?: number;
    conversions?: number;
    impressions?: number;
    ctr?: number;
    roas?: number;
  }>;
  metrics: string[];
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  height?: number;
}

const metricConfig = {
  spend: {
    color: '#3B82F6',
    name: 'Spend',
    yAxisId: 'left'
  },
  clicks: {
    color: '#10B981',
    name: 'Clicks',
    yAxisId: 'right'
  },
  conversions: {
    color: '#8B5CF6',
    name: 'Conversions',
    yAxisId: 'right'
  },
  impressions: {
    color: '#F59E0B',
    name: 'Impressions',
    yAxisId: 'right'
  },
  ctr: {
    color: '#EF4444',
    name: 'CTR (%)',
    yAxisId: 'left'
  },
  roas: {
    color: '#06B6D4',
    name: 'ROAS',
    yAxisId: 'left'
  }
};

const CustomTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
        <p className="font-medium text-gray-900 mb-2">
          {format(new Date(label), 'MMM dd, yyyy')}
        </p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const PerformanceChart: React.FC<PerformanceChartProps> = ({
  data,
  metrics,
  dateRange,
  height = 400
}) => {
  const chartData = useMemo(() => {
    return data.map(item => ({
      ...item,
      date: format(new Date(item.date), 'MM/dd')
    }));
  }, [data]);

  const hasLeftAxis = metrics.some(metric => metricConfig[metric as keyof typeof metricConfig]?.yAxisId === 'left');
  const hasRightAxis = metrics.some(metric => metricConfig[metric as keyof typeof metricConfig]?.yAxisId === 'right');

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-gray-500">
        <div className="text-center">
          <div className="text-6xl mb-4">📊</div>
          <p className="text-lg font-medium">No data available</p>
          <p className="text-sm">Try adjusting your date range or filters</p>
        </div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis
          dataKey="date"
          stroke="#6B7280"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        {hasLeftAxis && (
          <YAxis
            yAxisId="left"
            stroke="#6B7280"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
        )}
        {hasRightAxis && (
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#6B7280"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
        )}
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{
            paddingTop: '20px'
          }}
        />
        {metrics.map(metric => {
          const config = metricConfig[metric as keyof typeof metricConfig];
          if (!config) return null;

          return (
            <Line
              key={metric}
              type="monotone"
              dataKey={metric}
              stroke={config.color}
              strokeWidth={2}
              dot={false}
              name={config.name}
              yAxisId={config.yAxisId}
              connectNulls={false}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
};

export default PerformanceChart;

---

// frontend/src/components/common/LoadingSpinner.tsx
import React from 'react';
import clsx from 'clsx';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'blue' | 'white' | 'gray';
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8'
};

const colorClasses = {
  blue: 'text-blue-600',
  white: 'text-white',
  gray: 'text-gray-600'
};

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  color = 'blue',
  className
}) => {
  return (
    <div
      className={clsx(
        'animate-spin rounded-full border-2 border-solid border-current border-r-transparent',
        sizeClasses[size],
        colorClasses[color],
        className
      )}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
};

export default LoadingSpinner;

---

// frontend/src/components/common/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8">
            <div>
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
              </div>
              <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                Something went wrong
              </h2>
              <p className="mt-2 text-center text-sm text-gray-600">
                We apologize for the inconvenience. An unexpected error occurred.
              </p>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <h3 className="text-sm font-medium text-red-800 mb-2">Error Details:</h3>
                <pre className="text-xs text-red-700 whitespace-pre-wrap overflow-auto max-h-32">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </div>
            )}

            <div className="flex space-x-4">
              <button
                onClick={this.handleReset}
                className="flex-1 flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

---

// frontend/src/hooks/useAuth.ts
import { useState, useCallback } from 'react';
import { useAuthStore } from '../store/auth.store';
import { apiService } from '../services/api.service';
import toast from 'react-hot-toast';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

export const useAuth = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { setUser, setTokens, clearAuth, initialize: initializeAuth } = useAuthStore();

  const login = useCallback(async (credentials: LoginCredentials) => {
    setIsLoading(true);
    try {
      const response = await apiService.login(credentials);
      
      if (response.success) {
        setUser(response.user);
        setTokens(response.token, response.refreshToken);
        toast.success('Login successful!');
        return { success: true };
      } else {
        toast.error(response.message || 'Login failed');
        return { success: false, error: response.message };
      }
    } catch (error: any) {
      const message = error.response?.data?.message || 'Login failed';
      toast.error(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [setUser, setTokens]);

  const register = useCallback(async (data: RegisterData) => {
    setIsLoading(true);
    try {
      const response = await apiService.register(data);
      
      if (response.success) {
        setUser(response.user);
        setTokens(response.token, response.refreshToken);
        toast.success('Registration successful!');
        return { success: true };
      } else {
        toast.error(response.message || 'Registration failed');
        return { success: false, error: response.message };
      }
    } catch (error: any) {
      const message = error.response?.data?.message || 'Registration failed';
      toast.error(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, [setUser, setTokens]);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await apiService.logout();
      clearAuth();
      toast.success('Logged out successfully');
    } catch (error) {
      // Even if logout fails on server, clear local auth
      clearAuth();
    } finally {
      setIsLoading(false);
    }
  }, [clearAuth]);

  const refreshToken = useCallback(async () => {
    try {
      const response = await apiService.refreshToken();
      
      if (response.success) {
        setTokens(response.token, response.refreshToken);
        return { success: true };
      } else {
        clearAuth();
        return { success: false };
      }
    } catch (error) {
      clearAuth();
      return { success: false };
    }
  }, [setTokens, clearAuth]);

  const initialize = useCallback(async () => {
    return initializeAuth();
  }, [initializeAuth]);

  return {
    login,
    register,
    logout,
    refreshToken,
    initialize,
    isLoading
  };
};

---

// frontend/src/store/auth.store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiService } from '../services/api.service';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: string;
  emailVerified: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthActions {
  setUser: (user: User) => void;
  setTokens: (token: string, refreshToken: string) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: true,

      // Actions
      setUser: (user) => {
        set({ user, isAuthenticated: true });
      },

      setTokens: (token, refreshToken) => {
        set({ token, refreshToken });
        // Set token in API service
        apiService.setAuthToken(token);
      },

      clearAuth: () => {
        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false
        });
        // Clear token from API service
        apiService.clearAuthToken();
      },

      setLoading: (isLoading) => {
        set({ isLoading });
      },

      initialize: async () => {
        const { token, refreshToken } = get();
        
        if (token) {
          try {
            // Set token in API service
            apiService.setAuthToken(token);
            
            // Verify token and get user info
            const response = await apiService.getCurrentUser();
            
            if (response.success) {
              set({
                user: response.user,
                isAuthenticated: true,
                isLoading: false
              });
            } else {
              // Token invalid, try refresh
              if (refreshToken) {
                const refreshResponse = await apiService.refreshToken();
                
                if (refreshResponse.success) {
                  apiService.setAuthToken(refreshResponse.token);
                  const userResponse = await apiService.getCurrentUser();
                  
                  if (userResponse.success) {
                    set({
                      user: userResponse.user,
                      token: refreshResponse.token,
                      refreshToken: refreshResponse.refreshToken,
                      isAuthenticated: true,
                      isLoading: false
                    });
                  } else {
                    get().clearAuth();
                    set({ isLoading: false });
                  }
                } else {
                  get().clearAuth();
                  set({ isLoading: false });
                }
              } else {
                get().clearAuth();
                set({ isLoading: false });
              }
            }
          } catch (error) {
            console.error('Auth initialization error:', error);
            get().clearAuth();
            set({ isLoading: false });
          }
        } else {
          set({ isLoading: false });
        }
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user
      })
    }
  )
);

---

// frontend/src/services/api.service.ts
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import toast from 'react-hot-toast';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

class ApiService {
  private api: AxiosInstance;
  private authToken: string | null = null;

  constructor() {
    this.api = axios.create({
      baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000/api',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  setupInterceptors() {
    // Request interceptor
    this.api.interceptors.request.use(
      (config) => {
        if (this.authToken) {
          config.headers.Authorization = `Bearer ${this.authToken}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.api.interceptors.response.use(
      (response: AxiosResponse) => {
        return response;
      },
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            // Try to refresh token
            const refreshResponse = await this.refreshToken();
            
            if (refreshResponse.success) {
              this.setAuthToken(refreshResponse.token);
              originalRequest.headers.Authorization = `Bearer ${refreshResponse.token}`;
              return this.api(originalRequest);
            }
          } catch (refreshError) {
            // Refresh failed, redirect to login
            this.clearAuthToken();
            window.location.href = '/auth/login';
            return Promise.reject(refreshError);
          }
        }

        // Handle other errors
        if (error.response?.status >= 500) {
          toast.error('Server error. Please try again later.');
        } else if (error.response?.status === 429) {
          toast.error('Too many requests. Please slow down.');
        } else if (error.code === 'ECONNABORTED') {
          toast.error('Request timeout. Please check your connection.');
        } else if (!error.response) {
          toast.error('Network error. Please check your connection.');
        }

        return Promise.reject(error);
      }
    );
  }

  setAuthToken(token: string) {
    this.authToken = token;
  }

  clearAuthToken() {
    this.authToken = null;
  }

  // Auth endpoints
  async login(credentials: { email: string; password: string }) {
    const response = await this.api.post('/auth/login', credentials);
    return response.data;
  }

  async register(data: { email: string; password: string; name: string }) {
    const response = await this.api.post('/auth/register', data);
    return response.data;
  }

  async logout() {
    const response = await this.api.post('/auth/logout');
    return response.data;
  }

  async refreshToken() {
    const response = await this.api.post('/auth/refresh');
    return response.data;
  }

  async getCurrentUser() {
    const response = await this.api.get('/auth/me');
    return response.data;
  }

  // Dashboard endpoints
  async getDashboardData(dateRange: any, platforms: string[]) {
    const response = await this.api.get('/dashboard/metrics', {
      params: {
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
        platforms: platforms.join(',')
      }
    });
    return response.data;
  }

  async getAIInsights(dateRange: any) {
    const response = await this.api.get('/ai-insights', {
      params: {
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString()
      }
    });
    return response.data;
  }

  // Campaign endpoints
  async getCampaigns(params?: any) {
    const response = await this.api.get('/campaigns', { params });
    return response.data;
  }

  async getCampaign(id: string) {
    const response = await this.api.get(`/campaigns/${id}`);
    return response.data;
  }

  async createCampaign(data: any) {
    const response = await this.api.post('/campaigns', data);
    return response.data;
  }

  async updateCampaign(id: string, data: any) {
    const response = await this.api.put(`/campaigns/${id}`, data);
    return response.data;
  }

  async deleteCampaign(id: string) {
    const response = await this.api.delete(`/campaigns/${id}`);
    return response.data;
  }

  // Integration endpoints
  async getIntegrations() {
    const response = await this.api.get('/integrations');
    return response.data;
  }

  async createIntegration(data: any) {
    const response = await this.api.post('/integrations', data);
    return response.data;
  }

  async testIntegration(id: string) {
    const response = await this.api.post(`/integrations/${id}/test`);
    return response.data;
  }

  async syncIntegration(id: string) {
    const response = await this.api.post(`/integrations/${id}/sync`);
    return response.data;
  }

  // Reports endpoints
  async getReports() {
    const response = await this.api.get('/reports');
    return response.data;
  }

  async generateReport(data: any) {
    const response = await this.api.post('/reports', data);
    return response.data;
  }

  async downloadReport(id: string) {
    const response = await this.api.get(`/reports/${id}/download`, {
      responseType: 'blob'
    });
    return response.data;
  }
}

export const apiService = new ApiService();