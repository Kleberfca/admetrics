import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import toast from 'react-hot-toast';

// Types
interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

interface LoginCredentials {
  email: string;
  password: string;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface DashboardQuery {
  startDate?: string;
  endDate?: string;
  platforms?: string;
  campaignIds?: string;
}

interface MetricsQuery extends DashboardQuery {
  metrics?: string;
  groupBy?: 'day' | 'week' | 'month';
}

class ApiService {
  private api: AxiosInstance;
  private baseURL: string;

  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
    
    this.api = axios.create({
      baseURL: `${this.baseURL}/api`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor - add auth token
    this.api.interceptors.request.use(
      (config) => {
        const token = this.getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor - handle common errors
    this.api.interceptors.response.use(
      (response: AxiosResponse) => {
        return response;
      },
      (error) => {
        this.handleApiError(error);
        return Promise.reject(error);
      }
    );
  }

  private getAuthToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  private setAuthToken(token: string): void {
    localStorage.setItem('auth_token', token);
  }

  private removeAuthToken(): void {
    localStorage.removeItem('auth_token');
  }

  private handleApiError(error: any): void {
    if (!error.response) {
      toast.error('Network error. Please check your connection.');
      return;
    }

    const { status, data } = error.response;

    switch (status) {
      case 401:
        this.removeAuthToken();
        toast.error('Session expired. Please login again.');
        // Redirect to login page
        window.location.href = '/login';
        break;
      
      case 403:
        toast.error('Access denied. You don\'t have permission for this action.');
        break;
      
      case 404:
        toast.error('Resource not found.');
        break;
      
      case 409:
        toast.error(data.message || 'Conflict error occurred.');
        break;
      
      case 422:
        if (data.details && Array.isArray(data.details)) {
          data.details.forEach((detail: any) => {
            toast.error(`${detail.field}: ${detail.message}`);
          });
        } else {
          toast.error(data.message || 'Validation error occurred.');
        }
        break;
      
      case 429:
        toast.error('Too many requests. Please try again later.');
        break;
      
      case 500:
        toast.error('Server error. Please try again later.');
        break;
      
      default:
        toast.error(data.message || 'An error occurred. Please try again.');
    }
  }

  // Auth endpoints
  async login(credentials: LoginCredentials): Promise<{ user: any; token: string }> {
    const response = await this.api.post<ApiResponse<{ user: any; token: string }>>('/auth/login', credentials);
    
    if (response.data.success && response.data.data.token) {
      this.setAuthToken(response.data.data.token);
      toast.success('Logged in successfully!');
    }
    
    return response.data.data;
  }

  async register(data: RegisterData): Promise<{ user: any; token: string }> {
    const response = await this.api.post<ApiResponse<{ user: any; token: string }>>('/auth/register', data);
    
    if (response.data.success && response.data.data.token) {
      this.setAuthToken(response.data.data.token);
      toast.success('Account created successfully!');
    }
    
    return response.data.data;
  }

  async logout(): Promise<void> {
    try {
      await this.api.post('/auth/logout');
    } catch (error) {
      // Continue with logout even if API call fails
    } finally {
      this.removeAuthToken();
      toast.success('Logged out successfully');
    }
  }

  async refreshToken(): Promise<string> {
    const response = await this.api.post<ApiResponse<{ token: string }>>('/auth/refresh');
    
    if (response.data.success && response.data.data.token) {
      this.setAuthToken(response.data.data.token);
    }
    
    return response.data.data.token;
  }

  async forgotPassword(email: string): Promise<void> {
    const response = await this.api.post<ApiResponse>('/auth/forgot-password', { email });
    
    if (response.data.success) {
      toast.success('Password reset email sent!');
    }
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const response = await this.api.post<ApiResponse>('/auth/reset-password', { token, password });
    
    if (response.data.success) {
      toast.success('Password reset successfully!');
    }
  }

  // Dashboard endpoints
  async getDashboardOverview(query: DashboardQuery = {}): Promise<any> {
    const response = await this.api.get<ApiResponse>('/dashboard/overview', { params: query });
    return response.data.data;
  }

  async getPerformanceChart(query: MetricsQuery = {}): Promise<any> {
    const response = await this.api.get<ApiResponse>('/dashboard/performance-chart', { params: query });
    return response.data.data;
  }

  async getPlatformComparison(query: DashboardQuery & { metric?: string } = {}): Promise<any> {
    const response = await this.api.get<ApiResponse>('/dashboard/platform-comparison', { params: query });
    return response.data.data;
  }

  async getTopCampaigns(query: DashboardQuery & { metric?: string; limit?: number } = {}): Promise<any> {
    const response = await this.api.get<ApiResponse>('/dashboard/top-campaigns', { params: query });
    return response.data.data;
  }

  async saveDashboardLayout(data: {
    name: string;
    layout: any;
    widgets?: any;
    filters?: any;
    isDefault?: boolean;
  }): Promise<any> {
    const response = await this.api.post<ApiResponse>('/dashboard/layouts', data);
    
    if (response.data.success) {
      toast.success('Dashboard layout saved!');
    }
    
    return response.data.data;
  }

  async getDashboardLayouts(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/dashboard/layouts');
    return response.data.data;
  }

  async deleteDashboardLayout(id: string): Promise<void> {
    const response = await this.api.delete<ApiResponse>(`/dashboard/layouts/${id}`);
    
    if (response.data.success) {
      toast.success('Dashboard layout deleted!');
    }
  }

  // Campaigns endpoints
  async getCampaigns(params: any = {}): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/campaigns', { params });
    return response.data.data;
  }

  async getCampaign(id: string): Promise<any> {
    const response = await this.api.get<ApiResponse>(`/campaigns/${id}`);
    return response.data.data;
  }

  async createCampaign(data: any): Promise<any> {
    const response = await this.api.post<ApiResponse>('/campaigns', data);
    
    if (response.data.success) {
      toast.success('Campaign created successfully!');
    }
    
    return response.data.data;
  }

  async updateCampaign(id: string, data: any): Promise<any> {
    const response = await this.api.put<ApiResponse>(`/campaigns/${id}`, data);
    
    if (response.data.success) {
      toast.success('Campaign updated successfully!');
    }
    
    return response.data.data;
  }

  async deleteCampaign(id: string): Promise<void> {
    const response = await this.api.delete<ApiResponse>(`/campaigns/${id}`);
    
    if (response.data.success) {
      toast.success('Campaign deleted successfully!');
    }
  }

  // Integrations endpoints
  async getIntegrations(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/integrations');
    return response.data.data;
  }

  async createIntegration(data: any): Promise<any> {
    const response = await this.api.post<ApiResponse>('/integrations', data);
    
    if (response.data.success) {
      toast.success('Integration created successfully!');
    }
    
    return response.data.data;
  }

  async updateIntegration(id: string, data: any): Promise<any> {
    const response = await this.api.put<ApiResponse>(`/integrations/${id}`, data);
    
    if (response.data.success) {
      toast.success('Integration updated successfully!');
    }
    
    return response.data.data;
  }

  async deleteIntegration(id: string): Promise<void> {
    const response = await this.api.delete<ApiResponse>(`/integrations/${id}`);
    
    if (response.data.success) {
      toast.success('Integration deleted successfully!');
    }
  }

  async testIntegration(id: string): Promise<{ success: boolean; message: string }> {
    const response = await this.api.post<ApiResponse<{ success: boolean; message: string }>>(`/integrations/${id}/test`);
    
    if (response.data.data.success) {
      toast.success('Integration test successful!');
    } else {
      toast.error(`Integration test failed: ${response.data.data.message}`);
    }
    
    return response.data.data;
  }

  async syncIntegration(id: string): Promise<void> {
    const response = await this.api.post<ApiResponse>(`/integrations/${id}/sync`);
    
    if (response.data.success) {
      toast.success('Integration sync started!');
    }
  }

  // Reports endpoints
  async getReports(): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/reports');
    return response.data.data;
  }

  async generateReport(data: any): Promise<any> {
    const response = await this.api.post<ApiResponse>('/reports', data);
    
    if (response.data.success) {
      toast.success('Report generation started!');
    }
    
    return response.data.data;
  }

  async downloadReport(id: string): Promise<Blob> {
    const response = await this.api.get(`/reports/${id}/download`, {
      responseType: 'blob',
    });
    
    return response.data;
  }

  // AI Insights endpoints
  async getAIInsights(query: any = {}): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/ai-insights', { params: query });
    return response.data.data;
  }

  async dismissInsight(id: string): Promise<void> {
    const response = await this.api.post<ApiResponse>(`/ai-insights/${id}/dismiss`);
    
    if (response.data.success) {
      toast.success('Insight dismissed');
    }
  }

  async applyInsightRecommendation(id: string): Promise<void> {
    const response = await this.api.post<ApiResponse>(`/ai-insights/${id}/apply`);
    
    if (response.data.success) {
      toast.success('Recommendation applied successfully!');
    }
  }

  // Metrics endpoints
  async getMetrics(query: MetricsQuery = {}): Promise<any[]> {
    const response = await this.api.get<ApiResponse<any[]>>('/metrics', { params: query });
    return response.data.data;
  }

  async getMetricsSummary(query: DashboardQuery = {}): Promise<any> {
    const response = await this.api.get<ApiResponse>('/metrics/summary', { params: query });
    return response.data.data;
  }

  // User endpoints
  async getCurrentUser(): Promise<any> {
    const response = await this.api.get<ApiResponse>('/users/me');
    return response.data.data;
  }

  async updateProfile(data: any): Promise<any> {
    const response = await this.api.put<ApiResponse>('/users/me', data);
    
    if (response.data.success) {
      toast.success('Profile updated successfully!');
    }
    
    return response.data.data;
  }

  async changePassword(data: { currentPassword: string; newPassword: string }): Promise<void> {
    const response = await this.api.put<ApiResponse>('/users/me/password', data);
    
    if (response.data.success) {
      toast.success('Password changed successfully!');
    }
  }

  // Utility methods
  async uploadFile(file: File, endpoint: string): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.api.post<ApiResponse>(endpoint, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data.data;
  }

  async exportData(endpoint: string, params: any = {}, filename?: string): Promise<void> {
    const response = await this.api.get(endpoint, {
      params,
      responseType: 'blob',
    });

    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename || `export-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);

    toast.success('Export completed!');
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseURL}/health`);
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}

export const apiService = new ApiService();
export default apiService;