// frontend/src/types/common.types.ts
export type Platform = 
  | 'GOOGLE_ADS'
  | 'FACEBOOK_ADS'
  | 'INSTAGRAM_ADS'
  | 'TIKTOK_ADS'
  | 'LINKEDIN_ADS'
  | 'TWITTER_ADS'
  | 'YOUTUBE_ADS'
  | 'PINTEREST_ADS'
  | 'SNAPCHAT_ADS';

export type CampaignStatus = 
  | 'ACTIVE'
  | 'PAUSED'
  | 'ENDED'
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'DISAPPROVED'
  | 'LIMITED';

export type UserRole = 'USER' | 'ADMIN' | 'MANAGER';

export type IntegrationStatus = 'PENDING' | 'CONNECTED' | 'ERROR' | 'DISCONNECTED';

export type MetricType = 'CAMPAIGN' | 'ADSET' | 'AD' | 'KEYWORD';

export type BudgetType = 'DAILY' | 'LIFETIME';

export type SyncFrequency = 'REAL_TIME' | 'HOURLY' | 'DAILY' | 'WEEKLY';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface SortOptions {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export interface FilterOptions {
  platforms?: Platform[];
  status?: CampaignStatus[];
  dateRange?: DateRange;
  search?: string;
}

// ---

// frontend/src/types/auth.types.ts
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
  timezone: string;
  language: string;
  emailVerified: boolean;
  isActive: boolean;
  preferences?: any;
  permissions?: string[];
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  timezone?: string;
  language?: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  token?: string;
  refreshToken?: string;
  message?: string;
  error?: string;
}

export interface UserSession {
  id: string;
  userId: string;
  token: string;
  userAgent?: string;
  ipAddress?: string;
  isValid: boolean;
  expiresAt: string;
  createdAt: string;
}

// ---

// frontend/src/types/dashboard.types.ts
export interface MetricsData {
  totalSpend: number;
  totalClicks: number;
  totalImpressions: number;
  totalConversions: number;
  totalRevenue: number;
  averageCPC: number;
  averageCPM: number;
  averageCPA: number;
  averageCTR: number;
  averageROAS: number;
  averageROI: number;
}

export interface DashboardOverview {
  summary: {
    current: MetricsData;
    previous: MetricsData;
    change: {
      spend: number;
      clicks: number;
      conversions: number;
      roas: number;
    };
  };
  campaigns: {
    total: number;
    active: number;
    paused: number;
    list: CampaignData[];
  };
  performance: {
    data: Array<{
      date: string;
      value: number;
    }>;
    trend: {
      direction: 'increasing' | 'decreasing';
      strength: number;
      confidence: number;
    };
  };
  platforms: Array<{
    platform: Platform;
    spend: number;
    clicks: number;
    conversions: number;
    roas: number;
  }>;
  topCampaigns: CampaignData[];
  alerts: {
    total: number;
    unread: number;
    recent: AlertData[];
  };
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

export interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
  color?: string;
}

export interface TrendData {
  direction: 'up' | 'down' | 'neutral';
  percentage: number;
  label: string;
}

// ---

// frontend/src/types/campaign.types.ts
export interface CampaignData {
  id: string;
  externalId: string;
  name: string;
  status: CampaignStatus;
  platform: Platform;
  objective?: string;
  budget?: number;
  budgetType?: BudgetType;
  startDate?: string;
  endDate?: string;
  targeting?: any;
  geoTargeting?: any;
  creatives?: any;
  metrics?: {
    spend: number;
    clicks: number;
    impressions: number;
    conversions: number;
    ctr: number;
    cpc: number;
    cpa: number;
    roas: number;
  };
  userId: string;
  integrationId: string;
  organizationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignMetrics {
  campaignId: string;
  date: string;
  platform: Platform;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpa: number;
  roas: number;
  roi: number;
  qualityScore?: number;
  platformData?: any;
}

export interface CampaignPerformance {
  campaign: CampaignData;
  metrics: CampaignMetrics[];
  trends: {
    spend: TrendData;
    clicks: TrendData;
    conversions: TrendData;
    roas: TrendData;
  };
  insights: AIInsight[];
}

// ---

// frontend/src/types/integration.types.ts
export interface IntegrationData {
  id: string;
  userId: string;
  organizationId?: string;
  platform: Platform;
  name: string;
  status: IntegrationStatus;
  config?: any;
  scopes: string[];
  syncEnabled: boolean;
  syncFrequency: SyncFrequency;
  lastSyncAt?: string;
  nextSyncAt?: string;
  errorCount: number;
  lastError?: string;
  lastErrorAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationCredentials {
  platform: Platform;
  [key: string]: any; // Platform-specific credentials
}

export interface SyncLog {
  id: string;
  integrationId: string;
  status: 'SUCCESS' | 'ERROR' | 'PARTIAL';
  recordsCount: number;
  errorMessage?: string;
  duration?: number;
  metadata?: any;
  createdAt: string;
}

// ---

// frontend/src/types/ai.types.ts
export interface AIInsight {
  id: string;
  campaignId: string;
  type: 'PERFORMANCE' | 'BUDGET' | 'TARGETING' | 'CREATIVE' | 'ANOMALY';
  category: 'OPTIMIZATION' | 'ALERT' | 'PREDICTION' | 'RECOMMENDATION';
  title: string;
  description: string;
  confidence: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendations?: any;
  impact?: {
    metric: string;
    currentValue: number;
    predictedValue: number;
    improvement: number;
  };
  status: 'ACTIVE' | 'APPLIED' | 'DISMISSED';
  appliedAt?: string;
  dismissedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AIModel {
  id: string;
  name: string;
  version: string;
  type: 'PREDICTION' | 'OPTIMIZATION' | 'CLASSIFICATION' | 'ANOMALY_DETECTION';
  platform?: Platform;
  description?: string;
  algorithm: string;
  features: string[];
  performance: {
    accuracy?: number;
    precision?: number;
    recall?: number;
    f1Score?: number;
    mse?: number;
    mae?: number;
  };
  isActive: boolean;
  isDeployed: boolean;
  trainedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PredictionRequest {
  campaignId: string;
  days: number;
  metrics: string[];
  confidence?: number;
}

export interface PredictionResponse {
  campaignId: string;
  predictions: Array<{
    date: string;
    metric: string;
    value: number;
    confidence: number;
    bounds: {
      lower: number;
      upper: number;
    };
  }>;
  accuracy: number;
  generatedAt: string;
}

// ---

// frontend/src/types/alert.types.ts
export interface AlertData {
  id: string;
  userId: string;
  type: 'CAMPAIGN' | 'BUDGET' | 'PERFORMANCE' | 'INTEGRATION' | 'SYSTEM';
  title: string;
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  isRead: boolean;
  isActive: boolean;
  metadata?: any;
  relatedEntityId?: string;
  relatedEntityType?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertRule {
  id: string;
  userId: string;
  name: string;
  description?: string;
  condition: {
    metric: string;
    operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'between';
    value: number | [number, number];
    timeframe: string;
  };
  actions: Array<{
    type: 'EMAIL' | 'PUSH' | 'WEBHOOK' | 'SLACK';
    config: any;
  }>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---

// frontend/src/types/report.types.ts
export interface ReportData {
  id: string;
  userId: string;
  name: string;
  description?: string;
  type: 'STANDARD' | 'CUSTOM' | 'SCHEDULED';
  config: {
    dateRange: DateRange;
    platforms: Platform[];
    campaigns?: string[];
    metrics: string[];
    groupBy: string[];
    filters: any;
  };
  schedule?: {
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    dayOfWeek?: number;
    dayOfMonth?: number;
    time: string;
    timezone: string;
    recipients: string[];
  };
  lastGeneratedAt?: string;
  nextGenerationAt?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReportResult {
  id: string;
  reportId: string;
  data: any;
  format: 'JSON' | 'CSV' | 'PDF' | 'XLSX';
  fileUrl?: string;
  status: 'GENERATING' | 'COMPLETED' | 'ERROR';
  error?: string;
  generatedAt: string;
}

// ---

// frontend/src/types/api.types.ts
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  details?: any[];
}

export interface ApiError {
  success: false;
  error: string;
  message: string;
  details?: any[];
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: Pagination;
}

export interface QueryOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  filters?: Record<string, any>;
}

// Export all types
export type {
  Platform,
  CampaignStatus,
  UserRole,
  IntegrationStatus,
  MetricType,
  BudgetType,
  SyncFrequency,
  DateRange,
  Pagination,
  SortOptions,
  FilterOptions
};