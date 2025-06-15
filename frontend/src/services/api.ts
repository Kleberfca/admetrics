/**
 * API Service - Main API client for frontend
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { getSession, signOut } from 'next-auth/react';
import { toast } from 'react-toastify';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_VERSION = '/api/v1';

class ApiService {
  private instance: AxiosInstance;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (token: string) => void;
    reject: (error: any) => void;
  }> = [];

  constructor() {
    this.instance = axios.create({
      baseURL: `${API_BASE_URL}${API_VERSION}`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.instance.interceptors.request.use(
      async (config) => {
        const session = await getSession();
        
        if (session?.accessToken) {
          config.headers.Authorization = `Bearer ${session.accessToken}`;
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.instance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          if (this.isRefreshing) {
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            }).then((token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return this.instance(originalRequest);
            });
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const session = await getSession();
            if (session?.refreshToken) {
              // Attempt to refresh token
              const response = await this.post('/auth/refresh', {
                refresh_token: session.refreshToken,
              });

              const { access_token } = response.data;

              // Process queue
              this.failedQueue.forEach((prom) => {
                prom.resolve(access_token);
              });
              this.failedQueue = [];

              originalRequest.headers.Authorization = `Bearer ${access_token}`;
              return this.instance(originalRequest);
            }
          } catch (refreshError) {
            this.failedQueue.forEach((prom) => {
              prom.reject(refreshError);
            });
            this.failedQueue = [];
            
            // Sign out user
            await signOut({ redirect: true });
          } finally {
            this.isRefreshing = false;
          }
        }

        // Handle other errors
        this.handleError(error);
        return Promise.reject(error);
      }
    );
  }

  private handleError(error: any): void {
    if (error.response) {
      const { status, data } = error.response;
      
      switch (status) {
        case 400:
          toast.error(data.detail || 'Bad request');
          break;
        case 403:
          toast.error('You do not have permission to perform this action');
          break;
        case 404:
          toast.error('Resource not found');
          break;
        case 429:
          toast.error('Too many requests. Please try again later');
          break;
        case 500:
          toast.error('Server error. Please try again later');
          break;
        default:
          toast.error(data.detail || 'An error occurred');
      }
    } else if (error.request) {
      toast.error('Network error. Please check your connection');
    } else {
      toast.error('An unexpected error occurred');
    }
  }

  // HTTP Methods
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.instance.get<T>(url, config);
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.instance.post<T>(url, data, config);
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.instance.put<T>(url, data, config);
  }

  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.instance.patch<T>(url, data, config);
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.instance.delete<T>(url, config);
  }

  // File upload
  async uploadFile(url: string, file: File, onUploadProgress?: (progressEvent: any) => void): Promise<AxiosResponse> {
    const formData = new FormData();
    formData.append('file', file);

    return this.instance.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress,
    });
  }

  // Download file
  async downloadFile(url: string, filename: string): Promise<void> {
    const response = await this.instance.get(url, {
      responseType: 'blob',
    });

    const blob = new Blob([response.data]);
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
  }
}

// API Service instance
const apiService = new ApiService();

// Campaign API
export const campaignApi = {
  list: (params?: any) => apiService.get('/campaigns', { params }),
  get: (id: string) => apiService.get(`/campaigns/${id}`),
  create: (data: any) => apiService.post('/campaigns', data),
  update: (id: string, data: any) => apiService.put(`/campaigns/${id}`, data),
  delete: (id: string) => apiService.delete(`/campaigns/${id}`),
  getMetrics: (id: string, params?: any) => apiService.get(`/campaigns/${id}/metrics`, { params }),
  bulkAction: (action: string, ids: string[]) => apiService.post('/campaigns/bulk', { action, ids }),
};

// Metrics API
export const metricsApi = {
  getDashboard: (params?: any) => apiService.get('/metrics/dashboard', { params }),
  getOverview: (params?: any) => apiService.get('/metrics/overview', { params }),
  getComparison: (params?: any) => apiService.get('/metrics/comparison', { params }),
  export: (params: any) => apiService.post('/metrics/export', params),
};

// AI Insights API
export const aiApi = {
  predictPerformance: (data: any) => apiService.post('/ai/predict/campaign', data),
  optimizeBudget: (data: any) => apiService.post('/ai/optimize/budget', data),
  detectAnomalies: (params?: any) => apiService.get('/ai/anomalies/detect', { params }),
  getCampaignInsights: (id: string, params?: any) => apiService.get(`/ai/insights/campaign/${id}`, { params }),
  generateAdCopy: (data: any) => apiService.post('/ai/generate/ad-copy', data),
  analyzeSentiment: (data: any) => apiService.post('/ai/analyze/sentiment', data),
  segmentAudience: (data: any) => apiService.post('/ai/segment/audience', data),
  forecastMetric: (metric: string, params?: any) => apiService.get(`/ai/forecast/${metric}`, { params }),
};

// Reports API
export const reportsApi = {
  generate: (data: any) => apiService.post('/reports/generate', data),
  download: (id: string) => apiService.downloadFile(`/reports/download/${id}`, `report_${id}.pdf`),
  getTemplates: () => apiService.get('/reports/templates'),
  createTemplate: (data: any) => apiService.post('/reports/templates', data),
  schedule: (data: any) => apiService.post('/reports/schedule', data),
  getScheduled: () => apiService.get('/reports/scheduled'),
  cancelSchedule: (id: string) => apiService.delete(`/reports/scheduled/${id}`),
  getHistory: (params?: any) => apiService.get('/reports/history', { params }),
  emailReport: (data: any) => apiService.post('/reports/email', data),
};

// User API
export const userApi = {
  getProfile: () => apiService.get('/users/me'),
  updateProfile: (data: any) => apiService.put('/users/me', data),
  changePassword: (data: any) => apiService.post('/users/change-password', data),
  getPreferences: () => apiService.get('/users/preferences'),
  updatePreferences: (data: any) => apiService.put('/users/preferences', data),
  generateApiKey: () => apiService.post('/users/api-key'),
  revokeApiKey: () => apiService.delete('/users/api-key'),
};

// Organization API
export const organizationApi = {
  get: () => apiService.get('/organizations/current'),
  update: (data: any) => apiService.put('/organizations/current', data),
  getMembers: () => apiService.get('/organizations/members'),
  inviteMember: (data: any) => apiService.post('/organizations/members/invite', data),
  removeMember: (id: string) => apiService.delete(`/organizations/members/${id}`),
  updateMemberRole: (id: string, role: string) => apiService.patch(`/organizations/members/${id}`, { role }),
};

// Integration API
export const integrationApi = {
  list: () => apiService.get('/integrations'),
  connect: (platform: string, credentials: any) => apiService.post(`/integrations/${platform}/connect`, credentials),
  disconnect: (platform: string) => apiService.delete(`/integrations/${platform}`),
  test: (platform: string) => apiService.post(`/integrations/${platform}/test`),
  sync: (platform: string) => apiService.post(`/integrations/${platform}/sync`),
};

// Notification API
export const notificationApi = {
  list: (params?: any) => apiService.get('/notifications', { params }),
  markAsRead: (id: string) => apiService.patch(`/notifications/${id}/read`),
  markAllAsRead: () => apiService.post('/notifications/read-all'),
  delete: (id: string) => apiService.delete(`/notifications/${id}`),
  getPreferences: () => apiService.get('/notifications/preferences'),
  updatePreferences: (data: any) => apiService.put('/notifications/preferences', data),
};

export default apiService;