// User types
export interface User {
  id: string;
  email: string;
  username: string;
  fullName?: string;
  role: UserRole;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt?: Date;
  lastLogin?: Date;
}

export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  ANALYST = 'analyst',
  VIEWER = 'viewer',
}

// Campaign types
export interface Campaign {
  id: string;
  userId: string;
  integrationId: string;
  platform: Platform;
  externalId: string;
  name: string;
  status: CampaignStatus;
  objective?: string;
  budget?: number;
  budgetType?: BudgetType;
  startDate?: Date;
  endDate?: Date;
  targeting?: any;
  lastSyncAt?: Date;
  createdAt: Date;
  updatedAt?: Date;
}

export enum Platform {
  GOOGLE_ADS = 'GOOGLE_ADS',
  FACEBOOK_ADS = 'FACEBOOK_ADS',
  INSTAGRAM_ADS = 'INSTAGRAM_ADS',
  TIKTOK_ADS = 'TIKTOK_ADS',
  LINKEDIN_ADS = 'LINKEDIN_ADS',
  TWITTER_ADS = 'TWITTER_ADS',
  YOUTUBE_ADS = 'YOUTUBE_ADS',
  PINTEREST_ADS = 'PINTEREST_ADS',
  SNAPCHAT_ADS = 'SNAPCHAT_ADS',
}

export enum CampaignStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
}

export enum BudgetType {
  DAILY = 'DAILY',
  LIFETIME = 'LIFETIME',
}

// Metrics types
export interface Metric {
  id: string;
  campaignId: string;
  date: Date;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  cpa?: number;
  roas?: number;
  conversionRate?: number;
}

// Integration types
export interface Integration {
  id: string;
  userId: string;
  platform: Platform;
  name: string;
  status: IntegrationStatus;
  credentials: any; // Encrypted
  config?: any;
  lastSyncAt?: Date;
  syncEnabled: boolean;
  syncFrequency?: any;
  createdAt: Date;
  updatedAt?: Date;
}

export enum IntegrationStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ERROR = 'ERROR',
  PENDING = 'PENDING',
}

// AI Insights types
export interface AIInsight {
  id: string;
  campaignId: string;
  type: InsightType;
  category: InsightCategory;
  title: string;
  description: string;
  severity: InsightSeverity;
  confidence: number;
  data: any;
  recommendations: string[];
  isRead: boolean;
  isActioned: boolean;
  actionedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
}

export enum InsightType {
  PREDICTION = 'prediction',
  OPTIMIZATION = 'optimization',
  ANOMALY = 'anomaly',
  OPPORTUNITY = 'opportunity',
}

export enum InsightCategory {
  PERFORMANCE = 'performance',
  BUDGET = 'budget',
  AUDIENCE = 'audience',
  CREATIVE = 'creative',
  BIDDING = 'bidding',
}

export enum InsightSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

// Report types
export interface Report {
  id: string;
  userId: string;
  name: string;
  type: ReportType;
  status: ReportStatus;
  config: ReportConfig;
  downloadUrl?: string;
  expiresAt?: Date;
  createdAt: Date;
  completedAt?: Date;
}

export enum ReportType {
  PERFORMANCE = 'performance',
  CAMPAIGN = 'campaign',
  PLATFORM = 'platform',
  CUSTOM = 'custom',
}

export enum ReportStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface ReportConfig {
  campaigns?: string[];
  platforms?: Platform[];
  metrics: string[];
  dimensions: string[];
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  format: 'pdf' | 'excel' | 'csv';
  includeCharts?: boolean;
  includeInsights?: boolean;
}

// Auth types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  company?: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

// Request/Response types
export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// WebSocket event types
export interface WebSocketEvent {
  event: string;
  data: any;
  timestamp: Date;
}

export interface MetricUpdateEvent extends WebSocketEvent {
  event: 'metric_update';
  data: {
    campaignId: string;
    metric: Partial<Metric>;
  };
}

export interface InsightEvent extends WebSocketEvent {
  event: 'new_insight';
  data: AIInsight;
}

// Declare global types for Express
declare global {
  namespace Express {
    interface Request {
      user?: User;
      file?: MulterFile;
      files?: MulterFile[];
    }
  }
}

interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}