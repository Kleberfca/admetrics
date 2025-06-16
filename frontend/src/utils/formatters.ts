import { format, formatDistance, formatRelative, parseISO } from 'date-fns';

/**
 * Format currency values
 */
export const formatCurrency = (
  value: number,
  currency: string = 'USD',
  decimals: number = 2
): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
};

/**
 * Format large numbers with abbreviations
 */
export const formatNumber = (value: number, decimals: number = 0): string => {
  if (value >= 1000000000) {
    return `${(value / 1000000000).toFixed(decimals)}B`;
  }
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(decimals)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(decimals)}K`;
  }
  return value.toFixed(decimals);
};

/**
 * Format percentage values
 */
export const formatPercentage = (value: number, decimals: number = 1): string => {
  return `${value.toFixed(decimals)}%`;
};

/**
 * Format date to display format
 */
export const formatDate = (date: Date | string, formatString: string = 'MMM dd, yyyy'): string => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, formatString);
};

/**
 * Format date to relative time
 */
export const formatRelativeTime = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatDistance(dateObj, new Date(), { addSuffix: true });
};

/**
 * Format file size
 */
export const formatFileSize = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

/**
 * Format duration in seconds to human readable
 */
export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
};

/**
 * Format platform name for display
 */
export const formatPlatform = (platform: string): string => {
  const platformMap: Record<string, string> = {
    GOOGLE_ADS: 'Google Ads',
    FACEBOOK_ADS: 'Facebook Ads',
    INSTAGRAM_ADS: 'Instagram Ads',
    TIKTOK_ADS: 'TikTok Ads',
    LINKEDIN_ADS: 'LinkedIn Ads',
    TWITTER_ADS: 'Twitter Ads',
    YOUTUBE_ADS: 'YouTube Ads',
    PINTEREST_ADS: 'Pinterest Ads',
    SNAPCHAT_ADS: 'Snapchat Ads'
  };

  return platformMap[platform] || platform;
};

/**
 * Format metric name for display
 */
export const formatMetricName = (metric: string): string => {
  const metricMap: Record<string, string> = {
    ctr: 'CTR',
    cvr: 'CVR',
    cpc: 'CPC',
    cpm: 'CPM',
    cpa: 'CPA',
    roas: 'ROAS',
    roi: 'ROI'
  };

  return metricMap[metric.toLowerCase()] || 
    metric.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

/**
 * Truncate text with ellipsis
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength - 3)}...`;
};

/**
 * Format campaign status
 */
export const formatStatus = (status: string): { label: string; color: string } => {
  const statusMap: Record<string, { label: string; color: string }> = {
    ACTIVE: { label: 'Active', color: 'success' },
    PAUSED: { label: 'Paused', color: 'warning' },
    COMPLETED: { label: 'Completed', color: 'default' },
    DRAFT: { label: 'Draft', color: 'info' },
    SCHEDULED: { label: 'Scheduled', color: 'info' },
    ERROR: { label: 'Error', color: 'error' }
  };

  return statusMap[status] || { label: status, color: 'default' };
};