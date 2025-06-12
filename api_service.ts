// frontend/src/services/api.service.ts
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import toast from 'react-hot-toast';

// Types
import { 
  LoginCredentials, 
  RegisterData, 
  User, 
  AuthResponse,
  DashboardOverview,
  CampaignData,
  MetricsData,
  IntegrationData,
  AIInsight,
  DateRange,
  Platform
} from '../types';

interface ApiError {
  success: false;
  error: string;
  message: string;
  details?: any[];
}

interface ApiSuccess<T = any> {
  success: true;
  data: T;
  message?: string;
}

type ApiResponse<T = any> = ApiSuccess<T> | ApiError;

class ApiService {
  private api: AxiosInstance;
  private refreshPromise: Promise<string> | null = null;

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

  /**
   * Setup axios interceptors for authentication and error handling
   */
  setupInterceptors() {
    // Request interceptor to add auth token
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        // Add request ID for tracking
        config.headers['X-Request-ID'] = this.generateRequestId();
        
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for token refresh and error handling
    this.api.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

        // Handle 401 errors (token expired)
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const newToken = await this.refreshToken();
            if (newToken && originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              return this.api(originalRequest);
            }
          } catch (refreshError) {
            // Refresh failed, redirect to login
            this.handleAuthError();
            return Promise.reject(refreshError);
          }
        }

        // Handle other errors
        this.handleApiError(error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  /**
   * Handle API errors with user-friendly messages
   */
  private handleApiError(error: AxiosError) {
    const response = error.response?.data as ApiError;
    
    if (error.response?.status === 429) {
      toast.error('Too many requests. Please try again later.');
    } else if (error.response?.status >= 500) {
      toast.error('Server error. Please try again later.');
    } else if (response && response.message) {
      // Don't show toast for auth errors (handled elsewhere)
      if (error.response?.status !== 401 && error.response?.status !== 403) {
        toast.error(response.message);
      }
    } else if (error.code === 'NETWORK_ERROR') {
      toast.error('Network error. Please check your connection.');
    } else if (error.code === 'TIMEOUT') {
      toast.error('Request timeout. Please try again.');
    }
  }

  /**
   * Handle authentication errors
   */
  private handleAuthError() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    window.location.href = '/auth/login';
  }

  /**
   * Refresh access token
   */
  private async refreshToken(): Promise<string | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    this.refreshPromise = (async () => {
      try {
        const response = await axios.post(
          `${process.env.REACT_APP_API_URL || 'http://localhost:3000/api'}/auth/refresh`,
          { refreshToken },
          { timeout: 10000 }
        );

        const { token } = response.data;
        localStorage.setItem('token', token);
        return token;
      } catch (error) {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        throw error;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  // Authentication endpoints
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await this.api.post<AuthResponse>('/auth/login', credentials);
    return response.data;
  }

  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await this.api.post<AuthResponse>('/auth/register', data);
    return response.data;
  }

  async logout(): Promise<void> {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      await this.api.post('/auth/logout', { refreshToken });
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
    }
  }

  async forgotPassword(email: string): Promise<ApiResponse> {
    const response = await this.api.post('/auth/forgot-password', { email });
    return response.data;
  }

  async resetPassword(token: string, password: string): Promise<ApiResponse> {
    const response = await this.api.post('/auth/reset-password', { token, password });
    return response.data;
  }

  async getProfile(): Promise<User> {
    const response = await this.api.get<ApiSuccess<User>>('/auth/profile');
    return response.data.data;
  }

  async updateProfile(data: Partial<User>): Promise<User> {
    const response = await this.api.put<ApiSuccess<User>>('/auth/profile', data);
    return response.data.data;
  }

  // Dashboard endpoints
  async getDashboardOverview(params: {
    startDate: string;
    endDate: string;
    platforms?: Platform[];
    campaigns?: string[];
  }): Promise<DashboardOverview> {
    const response = await this.api.get<ApiSuccess<DashboardOverview>>('/dashboard/overview', {
      params: {
        startDate: params.startDate,
        endDate: params.endDate,
        platforms: params.platforms?.join(','),
        campaigns: params.campaigns?.join(',')
      }
    });
    return response.data.data;
  }

  async getDashboardMetrics(params: {
    startDate: string;
    endDate: string;
    platforms?: Platform[];
    campaigns?: string[];
    granularity?: 'hour' | 'day' | 'week' | 'month';
  }): Promise<MetricsData> {
    const response = await this.api.get<ApiSuccess<MetricsData>>('/dashboard/metrics', { params });
    return response.data.data;
  }

  async getRealTimeUpdates(platforms?: Platform[]): Promise<any> {
    const response = await this.api.get('/dashboard/real-time', {
      params: { platforms: platforms?.join(',') }
    });
    return response.data.data;
  }

  async exportDashboardData(params: {
    startDate: string;
    endDate: string;
    platforms?: Platform[];
    format?: 'csv' | 'json';
  }): Promise<string> {
    const response = await this.api.get('/dashboard/export', {
      params,
      responseType: 'text'
    });
    return response.data;
  }

  // Campaign endpoints
  async getCampaigns(params?: {
    page?: number;
    limit?: number;
    platforms?: Platform[];
    status?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ campaigns: CampaignData[]; total: number; pages: number }> {
    const response = await this.api.get('/campaigns', { params });
    return response.data.data;
  }

  async getCampaign(id: string): Promise<CampaignData> {
    const response = await this.api.get<ApiSuccess<CampaignData>>(`/campaigns/${id}`);
    return response.data.data;
  }

  async createCampaign(data: Partial<CampaignData>): Promise<CampaignData> {
    const response = await this.api.post<ApiSuccess<CampaignData>>('/campaigns', data);
    return response.data.data;
  }

  async updateCampaign(id: string, data: Partial<CampaignData>): Promise<CampaignData> {
    const response = await this.api.put<ApiSuccess<CampaignData>>(`/campaigns/${id}`, data);
    return response.data.data;
  }

  async deleteCampaign(id: string): Promise<void> {
    await this.api.delete(`/campaigns/${id}`);
  }

  async getCampaignMetrics(id: string, params: {
    startDate: string;
    endDate: string;
    granularity?: string;
  }): Promise<MetricsData> {
    const response = await this.api.get<ApiSuccess<MetricsData>>(`/campaigns/${id}/metrics`, { params });
    return response.data.data;
  }

  // Integration endpoints
  async getIntegrations(): Promise<IntegrationData[]> {
    const response = await this.api.get<ApiSuccess<IntegrationData[]>>('/integrations');
    return response.data.data;
  }

  async createIntegration(data: {
    platform: Platform;
    name: string;
    credentials: any;
  }): Promise<IntegrationData> {
    const response = await this.api.post<ApiSuccess<IntegrationData>>('/integrations', data);
    return response.data.data;
  }

  async updateIntegration(id: string, data: Partial<IntegrationData>): Promise<IntegrationData> {
    const response = await this.api.put<ApiSuccess<IntegrationData>>(`/integrations/${id}`, data);
    return response.data.data;
  }

  async deleteIntegration(id: string): Promise<void> {
    await this.api.delete(`/integrations/${id}`);
  }

  async testIntegration(id: string): Promise<{ success: boolean; message: string }> {
    const response = await this.api.post(`/integrations/${id}/test`);
    return response.data.data;
  }

  async syncIntegration(id: string): Promise<{ success: boolean; message: string }> {
    const response = await this.api.post(`/integrations/${id}/sync`);
    return response.data.data;
  }

  // AI Insights endpoints
  async getAIInsights(params?: {
    startDate?: string;
    endDate?: string;
    limit?: number;
    type?: string;
  }): Promise<{ insights: AIInsight[]; summary: any }> {
    const response = await this.api.get('/ai-insights', { params });
    return response.data.data;
  }

  async getInsight(id: string): Promise<AIInsight> {
    const response = await this.api.get<ApiSuccess<AIInsight>>(`/ai-insights/${id}`);
    return response.data.data;
  }

  async applyInsight(id: string): Promise<void> {
    await this.api.post(`/ai-insights/${id}/apply`);
  }

  async dismissInsight(id: string): Promise<void> {
    await this.api.post(`/ai-insights/${id}/dismiss`);
  }

  async predictPerformance(data: {
    campaignId: string;
    days: number;
    metrics: string[];
  }): Promise<any> {
    const response = await this.api.post('/ai-insights/predict', data);
    return response.data.data;
  }

  async optimizeBudget(data: {
    campaignIds: string[];
    totalBudget: number;
    objective: string;
  }): Promise<any> {
    const response = await this.api.post('/ai-insights/optimize-budget', data);
    return response.data.data;
  }

  // Metrics endpoints
  async getMetrics(params: {
    startDate: string;
    endDate: string;
    platforms?: Platform[];
    campaigns?: string[];
    granularity?: string;
  }): Promise<MetricsData[]> {
    const response = await this.api.get<ApiSuccess<MetricsData[]>>('/metrics', { params });
    return response.data.data;
  }

  async getMetricsTrends(params: {
    metric: string;
    startDate: string;
    endDate: string;
    platforms?: Platform[];
  }): Promise<any> {
    const response = await this.api.get('/metrics/trends', { params });
    return response.data.data;
  }

  async getPlatformComparison(params: {
    startDate: string;
    endDate: string;
    metric: string;
  }): Promise<any> {
    const response = await this.api.get('/metrics/platform-comparison', { params });
    return response.data.data;
  }

  // Reports endpoints
  async getReports(): Promise<any[]> {
    const response = await this.api.get('/reports');
    return response.data.data;
  }

  async createReport(data: any): Promise<any> {
    const response = await this.api.post('/reports', data);
    return response.data.data;
  }

  async getReport(id: string): Promise<any> {
    const response = await this.api.get(`/reports/${id}`);
    return response.data.data;
  }

  async downloadReport(id: string): Promise<Blob> {
    const response = await this.api.get(`/reports/${id}/download`, {
      responseType: 'blob'
    });
    return response.data;
  }

  // Alerts endpoints
  async getAlerts(params?: {
    unreadOnly?: boolean;
    limit?: number;
  }): Promise<any[]> {
    const response = await this.api.get('/alerts', { params });
    return response.data.data;
  }

  async markAlertAsRead(id: string): Promise<void> {
    await this.api.put(`/alerts/${id}/read`);
  }

  async markAllAlertsAsRead(): Promise<void> {
    await this.api.put('/alerts/read-all');
  }

  // File upload
  async uploadFile(file: File, type: 'avatar' | 'report' | 'creative'): Promise<{ url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    const response = await this.api.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data.data;
  }

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await this.api.get('/health');
    return response.data;
  }

  // WebSocket connection info
  getWebSocketUrl(): string {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = process.env.REACT_APP_WS_URL || 
                   `${wsProtocol}//${window.location.hostname}:3000`;
    return wsHost;
  }

  // Request cancellation
  createCancelToken() {
    return axios.CancelToken.source();
  }

  // Batch requests
  async batchRequest(requests: Array<{ method: string; url: string; data?: any }>): Promise<any[]> {
    const promises = requests.map(req => 
      this.api.request({
        method: req.method as any,
        url: req.url,
        data: req.data
      })
    );

    const responses = await Promise.allSettled(promises);
    return responses.map(response => 
      response.status === 'fulfilled' ? response.value.data : response.reason
    );
  }
}

export const apiService = new ApiService();
export default apiService;