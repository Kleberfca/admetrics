// Common TypeScript types for AdMetrics Dashboard

// =============================================================================
// GENERAL TYPES
// =============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
  timestamp?: string;
}

export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface TimeRange {
  value: string;
  label: string;
  days: number;
}

// =============================================================================
// USER & AUTHENTICATION TYPES
// =============================================================================

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
  isActive: boolean;
  emailVerified: boolean;
  timezone: string;
  language: string;
  preferences?: UserPreferences;
  organizationId?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
  VIEWER = 'VIEWER',
}

export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  currency?: string;
  dateFormat?: string;
  notifications?: NotificationPreferences;
  dashboard?: DashboardPreferences;
}

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  alerts: boolean;
  weeklyReport: boolean;
  monthlyReport: boolean;
}

export interface DashboardPreferences {
  defaultMetrics: string[];
  refreshInterval: number;
  showRealTime: boolean;
  compactView: boolean;
}

// =============================================================================
// PLATFORM TYPES
// =============================================================================

export enum Platform {
  GOOGLE_ADS = 'GOOGLE_ADS',
  FACEBOOK_ADS = 'FACEBOOK_ADS',
  INSTAGRAM_ADS = 'INSTAGRAM_ADS',
  TIKTOK_ADS = 'TIKTOK_ADS',
  LINKEDIN_ADS = 'LINKEDIN_ADS',
  TWITTER_ADS = 'TWITTER_ADS',
  PINTEREST_ADS = 'PINTEREST_ADS',
  SNAPCHAT_ADS = 'SNAPCHAT_ADS',
  YOUTUBE_ADS = 'YOUTUBE_ADS',
}

export interface PlatformInfo {
  name: string;
  icon: string;
  color: string;
  description: string;
  features: string[];
  supportedMetrics: string[];
}

// =============================================================================
// CAMPAIGN TYPES
// =============================================================================

export interface Campaign {
  id: string;
  name: string;
  platform: Platform;
  status: CampaignStatus;
  objective?: string;
  budget?: number;
  budgetType?: BudgetType;
  startDate?: string;
  endDate?: string;
  targeting?: CampaignTargeting;
  creativeAssets?: CreativeAsset[];
  userId: string;
  integrationId: string;
  organizationId?: string;
  createdAt: string;
  updatedAt: string;
}

export enum CampaignStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  ENDED = 'ENDED',
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  REJECTED = 'REJECTED',
}

export enum BudgetType {
  DAILY = 'DAILY',
  LIFETIME = 'LIFETIME',
}

export interface CampaignTargeting {
  demographics?: {
    ageMin?: number;
    ageMax?: number;
    gender?: string[];
  };
  interests?: string[];
  behaviors?: string[];
  locations?: string[];
  languages?: string[];
  devices?: string[];
  placements?: string[];
}

export interface CreativeAsset {
  id: string;
  type: 'IMAGE' | 'VIDEO' | 'CAROUSEL' | 'TEXT';
  url?: string;
  title?: string;
  description?: string;
  callToAction?: string;
  dimensions?: {
    width: number;
    height: number;
  };
}

// =============================================================================
// METRICS TYPES
// =============================================================================

export interface Metric {
  id: string;
  campaignId: string;
  integrationId: string;
  platform: Platform;
  date: string;
  metricType: MetricType;
  spend?: number;
  clicks?: number;
  impressions?: number;
  conversions?: number;
  revenue?: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  cpa?: number;
  roas?: number;
  roi?: number;
  qualityScore?: number;
  relevanceScore?: number;
  platformData?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export enum MetricType {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  TOTAL = 'TOTAL',
}

export interface MetricsSummary {
  totalSpend: number;
  totalClicks: number;
  totalImpressions: number;
  totalConversions: number;
  totalRevenue: number;
  averageCTR: number;
  averageCPC: number;
  averageCPM: number;
  averageCPA: number;
  averageROAS: number;
  averageROI: number;
  platformBreakdown: Record<Platform, Partial<MetricsSummary>>;
  trends: {
    spendTrend: number;
    clicksTrend: number;
    conversionsTrend: number;
    revenueTrend: number;
    roasTrend: number;
  };
}

export interface RealTimeMetrics {
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  timestamp: Date;
  platform: Platform;
  campaignId: string;
}

// =============================================================================
// INTEGRATION TYPES
// =============================================================================

export interface Integration {
  id: string;
  userId: string;
  organizationId?: string;
  platform: Platform;
  name: string;
  status: IntegrationStatus;
  credentials: Record<string, any>; // Encrypted
  config?: Record<string, any>;
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

export enum IntegrationStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  ERROR = 'ERROR',
  DISABLED = 'DISABLED',
  EXPIRED = 'EXPIRED',
}

export enum SyncFrequency {
  REAL_TIME = 'REAL_TIME',
  HOURLY = 'HOURLY',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
}

export interface SyncLog {
  id: string;
  integrationId: string;
  status: SyncStatus;
  recordsCount: number;
  errorMessage?: string;
  duration?: number;
  metadata?: Record<string, any>;
  createdAt: string;
}

export enum SyncStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

// =============================================================================
// AI TYPES
// =============================================================================

export interface AIInsight {
  id: string;
  campaignId: string;
  type: InsightType;
  category: InsightCategory;
  title: string;
  description: string;
  confidence: number;
  priority: Priority;
  recommendations?: Recommendation[];
  impact?: ImpactEstimate;
  status: InsightStatus;
  appliedAt?: string;
  dismissedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export enum InsightType {
  PERFORMANCE_ANOMALY = 'PERFORMANCE_ANOMALY',
  BUDGET_OPTIMIZATION = 'BUDGET_OPTIMIZATION',
  AUDIENCE_EXPANSION = 'AUDIENCE_EXPANSION',
  CREATIVE_OPTIMIZATION = 'CREATIVE_OPTIMIZATION',
  BID_OPTIMIZATION = 'BID_OPTIMIZATION',
  KEYWORD_OPPORTUNITY = 'KEYWORD_OPPORTUNITY',
  COMPETITIVE_INTELLIGENCE = 'COMPETITIVE_INTELLIGENCE',
}

export enum InsightCategory {
  OPTIMIZATION = 'OPTIMIZATION',
  ALERT = 'ALERT',
  OPPORTUNITY = 'OPPORTUNITY',
  RECOMMENDATION = 'RECOMMENDATION',
}

export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum InsightStatus {
  ACTIVE = 'ACTIVE',
  APPLIED = 'APPLIED',
  DISMISSED = 'DISMISSED',
  EXPIRED = 'EXPIRED',
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  action: string;
  confidence: number;
  expectedImpact: ImpactEstimate;
  implementationComplexity: 'LOW' | 'MEDIUM' | 'HIGH';
  timeToImplement: string;
}

export interface ImpactEstimate {
  metric: string;
  currentValue: number;
  projectedValue: number;
  confidence: number;
  timeframe: string;
}

// =============================================================================
// DASHBOARD TYPES
// =============================================================================

export interface DashboardOverview {
  summary: MetricsSummary;
  activeCampaigns: number;
  integrations: IntegrationsStatus;
  alerts: Alert[];
  performance: PerformanceScore;
  dateRange: DateRange;
  lastUpdated: string;
}

export interface IntegrationsStatus {
  total: number;
  active: number;
  errors: number;
  lastSync?: string;
}

export interface PerformanceScore {
  score: number;
  grade: string;
  factors: ScoreFactor[];
}

export interface ScoreFactor {
  name: string;
  score: number;
  weight: number;
  description: string;
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  position: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  config: Record<string, any>;
  dataSource: string;
  refreshInterval?: number;
}

export enum WidgetType {
  METRIC_CARD = 'METRIC_CARD',
  LINE_CHART = 'LINE_CHART',
  BAR_CHART = 'BAR_CHART',
  PIE_CHART = 'PIE_CHART',
  TABLE = 'TABLE',
  MAP = 'MAP',
  TEXT = 'TEXT',
  AI_INSIGHTS = 'AI_INSIGHTS',
}

// =============================================================================
// ALERT TYPES
// =============================================================================

export interface Alert {
  id: string;
  userId: string;
  name: string;
  description?: string;
  conditions: AlertCondition[];
  channels: AlertChannel[];
  isActive: boolean;
  lastTriggered?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertCondition {
  metric: string;
  operator: 'GT' | 'LT' | 'EQ' | 'GTE' | 'LTE' | 'CHANGE_GT' | 'CHANGE_LT';
  value: number;
  period: string;
}

export enum AlertChannel {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  PUSH = 'PUSH',
  SLACK = 'SLACK',
  WEBHOOK = 'WEBHOOK',
}

// =============================================================================
// REPORT TYPES
// =============================================================================

export interface Report {
  id: string;
  userId: string;
  name: string;
  description?: string;
  type: ReportType;
  config: ReportConfig;
  filters?: Record<string, any>;
  schedule?: ReportSchedule;
  status: ReportStatus;
  filePath?: string;
  fileSize?: number;
  isPublic: boolean;
  shareToken?: string;
  createdAt: string;
  updatedAt: string;
}

export enum ReportType {
  PERFORMANCE = 'PERFORMANCE',
  CAMPAIGN_ANALYSIS = 'CAMPAIGN_ANALYSIS',
  PLATFORM_COMPARISON = 'PLATFORM_COMPARISON',
  AUDIENCE_INSIGHTS = 'AUDIENCE_INSIGHTS',
  BUDGET_ANALYSIS = 'BUDGET_ANALYSIS',
  CUSTOM = 'CUSTOM',
}

export interface ReportConfig {
  metrics: string[];
  dimensions: string[];
  dateRange: DateRange;
  groupBy?: string;
  filters?: Record<string, any>;
  format: 'PDF' | 'CSV' | 'XLSX' | 'JSON';
  includeCharts: boolean;
  includeSummary: boolean;
}

export interface ReportSchedule {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  time: string;
  timezone: string;
  recipients: string[];
  isActive: boolean;
}

export enum ReportStatus {
  DRAFT = 'DRAFT',
  GENERATING = 'GENERATING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
  SCHEDULED = 'SCHEDULED',
}

// =============================================================================
// FORM TYPES
// =============================================================================

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password' | 'number' | 'select' | 'multiselect' | 'checkbox' | 'radio' | 'textarea' | 'date' | 'daterange';
  placeholder?: string;
  required?: boolean;
  validation?: ValidationRule[];
  options?: SelectOption[];
  defaultValue?: any;
  disabled?: boolean;
  description?: string;
}

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
  group?: string;
}

export interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'pattern' | 'custom';
  value?: any;
  message: string;
}

// =============================================================================
// CHART TYPES
// =============================================================================

export interface ChartData {
  date: string;
  timestamp: number;
  [key: string]: any;
}

export interface ChartConfig {
  type: 'line' | 'bar' | 'area' | 'pie' | 'scatter';
  metrics: string[];
  groupBy?: string;
  showLegend: boolean;
  showTooltip: boolean;
  showGrid: boolean;
  height: number;
  colors?: string[];
  yAxisFormat?: string;
  xAxisFormat?: string;
}

// =============================================================================
// FILTER TYPES
// =============================================================================

export interface FilterOption {
  key: string;
  label: string;
  type: 'select' | 'multiselect' | 'daterange' | 'number' | 'text';
  options?: SelectOption[];
  defaultValue?: any;
  placeholder?: string;
}

export interface AppliedFilter {
  key: string;
  value: any;
  operator?: string;
  label?: string;
}

// =============================================================================
// NOTIFICATION TYPES
// =============================================================================

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  autoHide?: boolean;
  duration?: number;
  timestamp: string;
}

// =============================================================================
// WEBSOCKET TYPES
// =============================================================================

export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: string;
}

export interface ConnectionStatus {
  connected: boolean;
  lastUpdate: Date | null;
  error: string | null;
  reconnectAttempts: number;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncState<T = any> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastUpdated?: string;
}

export type SortOrder = 'asc' | 'desc';

export interface SortConfig {
  key: string;
  order: SortOrder;
}

export interface PaginationConfig {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// =============================================================================
// ERROR TYPES
// =============================================================================

export interface AppError {
  code: string;
  message: string;
  details?: any;
  timestamp: string;
  requestId?: string;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

// =============================================================================
// EXPORT ALL TYPES
// =============================================================================

export type {
  ApiResponse,
  PaginatedResponse,
  DateRange,
  TimeRange,
  User,
  UserPreferences,
  NotificationPreferences,
  DashboardPreferences,
  Campaign,
  CampaignTargeting,
  CreativeAsset,
  Metric,
  MetricsSummary,
  RealTimeMetrics,
  Integration,
  SyncLog,
  AIInsight,
  Recommendation,
  ImpactEstimate,
  DashboardOverview,
  DashboardWidget,
  Alert,
  AlertCondition,
  Report,
  ReportConfig,
  ReportSchedule,
  FormField,
  SelectOption,
  ValidationRule,
  ChartData,
  ChartConfig,
  FilterOption,
  AppliedFilter,
  Notification,
  WebSocketMessage,
  ConnectionStatus,
  AsyncState,
  SortConfig,
  PaginationConfig,
  AppError,
  ValidationError,
};