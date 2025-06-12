// frontend/src/utils/formatters.ts

/**
 * Format currency values
 */
export const formatCurrency = (
  value: number,
  currency: string = 'USD',
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    notation?: 'standard' | 'compact' | 'scientific' | 'engineering';
    compactDisplay?: 'short' | 'long';
  }
): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return '$0.00';
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: options?.minimumFractionDigits ?? 2,
      maximumFractionDigits: options?.maximumFractionDigits ?? 2,
      notation: options?.notation ?? 'standard',
      compactDisplay: options?.compactDisplay ?? 'short'
    }).format(value);
  } catch (error) {
    // Fallback for unsupported currencies or browsers
    return `$${formatNumber(value, { 
      minimumFractionDigits: options?.minimumFractionDigits ?? 2,
      maximumFractionDigits: options?.maximumFractionDigits ?? 2 
    })}`;
  }
};

/**
 * Format compact currency (e.g., $1.2K, $3.4M)
 */
export const formatCompactCurrency = (
  value: number,
  currency: string = 'USD'
): string => {
  return formatCurrency(value, currency, {
    notation: 'compact',
    maximumFractionDigits: 1
  });
};

/**
 * Format number values
 */
export const formatNumber = (
  value: number,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    notation?: 'standard' | 'compact' | 'scientific' | 'engineering';
    compactDisplay?: 'short' | 'long';
  }
): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: options?.minimumFractionDigits ?? 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
    notation: options?.notation ?? 'standard',
    compactDisplay: options?.compactDisplay ?? 'short'
  }).format(value);
};

/**
 * Format compact number (e.g., 1.2K, 3.4M, 5.6B)
 */
export const formatCompactNumber = (value: number): string => {
  return formatNumber(value, {
    notation: 'compact',
    maximumFractionDigits: 1
  });
};

/**
 * Format percentage values
 */
export const formatPercentage = (
  value: number,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    showSign?: boolean;
  }
): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0%';
  }

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: options?.minimumFractionDigits ?? 1,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2
  }).format(value / 100);

  if (options?.showSign && value > 0) {
    return `+${formatted}`;
  }

  return formatted;
};

/**
 * Format date values
 */
export const formatDate = (
  date: Date | string | number,
  options?: {
    format?: 'short' | 'medium' | 'long' | 'full';
    includeTime?: boolean;
    relative?: boolean;
    timezone?: string;
  }
): string => {
  if (!date) return '';

  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) return 'Invalid Date';

  // Relative time formatting
  if (options?.relative) {
    return formatRelativeTime(dateObj);
  }

  const formatOptions: Intl.DateTimeFormatOptions = {};

  // Date format
  switch (options?.format) {
    case 'short':
      formatOptions.dateStyle = 'short';
      break;
    case 'medium':
      formatOptions.dateStyle = 'medium';
      break;
    case 'long':
      formatOptions.dateStyle = 'long';
      break;
    case 'full':
      formatOptions.dateStyle = 'full';
      break;
    default:
      formatOptions.year = 'numeric';
      formatOptions.month = 'short';
      formatOptions.day = 'numeric';
  }

  // Include time
  if (options?.includeTime) {
    formatOptions.hour = '2-digit';
    formatOptions.minute = '2-digit';
  }

  // Timezone
  if (options?.timezone) {
    formatOptions.timeZone = options.timezone;
  }

  return new Intl.DateTimeFormat('en-US', formatOptions).format(dateObj);
};

/**
 * Format relative time (e.g., "2 hours ago", "in 3 days")
 */
export const formatRelativeTime = (date: Date | string | number): string => {
  const dateObj = new Date(date);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  const units = [
    { name: 'year', seconds: 31536000 },
    { name: 'month', seconds: 2592000 },
    { name: 'week', seconds: 604800 },
    { name: 'day', seconds: 86400 },
    { name: 'hour', seconds: 3600 },
    { name: 'minute', seconds: 60 },
    { name: 'second', seconds: 1 }
  ];

  for (const unit of units) {
    const interval = Math.floor(Math.abs(diffInSeconds) / unit.seconds);
    if (interval >= 1) {
      const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
      return rtf.format(diffInSeconds > 0 ? -interval : interval, unit.name as Intl.RelativeTimeFormatUnit);
    }
  }

  return 'just now';
};

/**
 * Format time duration in seconds to human readable format
 */
export const formatDuration = (seconds: number): string => {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  } else if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  } else {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
};

/**
 * Format file size in bytes to human readable format
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

/**
 * Format phone number
 */
export const formatPhoneNumber = (phoneNumber: string): string => {
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  } else if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  
  return phoneNumber;
};

/**
 * Format metric values with appropriate units
 */
export const formatMetric = (
  value: number,
  metric: string,
  options?: {
    compact?: boolean;
    currency?: string;
    showUnit?: boolean;
  }
): string => {
  const { compact = false, currency = 'USD', showUnit = true } = options || {};

  switch (metric.toLowerCase()) {
    case 'spend':
    case 'cost':
    case 'revenue':
    case 'cpc':
    case 'cpm':
    case 'cpa':
      return compact ? formatCompactCurrency(value, currency) : formatCurrency(value, currency);
    
    case 'clicks':
    case 'impressions':
    case 'conversions':
    case 'views':
      return compact ? formatCompactNumber(value) : formatNumber(value);
    
    case 'ctr':
    case 'cvr':
    case 'roas':
    case 'roi':
      if (metric.toLowerCase() === 'roas' || metric.toLowerCase() === 'roi') {
        return `${formatNumber(value, { maximumFractionDigits: 2 })}${showUnit ? 'x' : ''}`;
      }
      return formatPercentage(value);
    
    case 'frequency':
      return formatNumber(value, { maximumFractionDigits: 2 });
    
    default:
      return compact ? formatCompactNumber(value) : formatNumber(value);
  }
};

/**
 * Format ROAS (Return on Ad Spend) value
 */
export const formatROAS = (value: number): string => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0.00x';
  }
  return `${formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
};

/**
 * Format CTR (Click-Through Rate) value
 */
export const formatCTR = (clicks: number, impressions: number): string => {
  if (!impressions || impressions === 0) return '0.00%';
  const ctr = (clicks / impressions) * 100;
  return formatPercentage(ctr);
};

/**
 * Format conversion rate
 */
export const formatConversionRate = (conversions: number, clicks: number): string => {
  if (!clicks || clicks === 0) return '0.00%';
  const cvr = (conversions / clicks) * 100;
  return formatPercentage(cvr);
};

/**
 * Format platform name for display
 */
export const formatPlatformName = (platform: string): string => {
  const platformNames: Record<string, string> = {
    'GOOGLE_ADS': 'Google Ads',
    'FACEBOOK_ADS': 'Facebook Ads',
    'INSTAGRAM_ADS': 'Instagram Ads',
    'TIKTOK_ADS': 'TikTok Ads',
    'LINKEDIN_ADS': 'LinkedIn Ads',
    'TWITTER_ADS': 'Twitter Ads',
    'YOUTUBE_ADS': 'YouTube Ads',
    'PINTEREST_ADS': 'Pinterest Ads',
    'SNAPCHAT_ADS': 'Snapchat Ads'
  };

  return platformNames[platform] || platform.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

/**
 * Format campaign status for display
 */
export const formatCampaignStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    'ACTIVE': 'Active',
    'PAUSED': 'Paused',
    'ENDED': 'Ended',
    'DRAFT': 'Draft',
    'PENDING_REVIEW': 'Pending Review',
    'DISAPPROVED': 'Disapproved',
    'LIMITED': 'Limited'
  };

  return statusMap[status] || status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

/**
 * Truncate text with ellipsis
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

/**
 * Format API error messages
 */
export const formatErrorMessage = (error: any): string => {
  if (typeof error === 'string') return error;
  
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  
  if (error?.message) {
    return error.message;
  }
  
  if (error?.error) {
    return error.error;
  }
  
  return 'An unexpected error occurred';
};

/**
 * Format validation errors
 */
export const formatValidationErrors = (errors: any[]): string => {
  if (!Array.isArray(errors) || errors.length === 0) {
    return 'Validation failed';
  }
  
  return errors.map(error => {
    if (typeof error === 'string') return error;
    if (error.message) return error.message;
    if (error.path && error.message) return `${error.path}: ${error.message}`;
    return 'Invalid input';
  }).join(', ');
};

export default {
  formatCurrency,
  formatCompactCurrency,
  formatNumber,
  formatCompactNumber,
  formatPercentage,
  formatDate,
  formatRelativeTime,
  formatDuration,
  formatFileSize,
  formatPhoneNumber,
  formatMetric,
  formatROAS,
  formatCTR,
  formatConversionRate,
  formatPlatformName,
  formatCampaignStatus,
  truncateText,
  formatErrorMessage,
  formatValidationErrors
};