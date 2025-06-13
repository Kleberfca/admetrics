// backend/src/utils/data-normalizer.ts
import { Platform } from '@prisma/client';
import { logger } from './logger';

export interface PlatformMetrics {
  platform: Platform;
  campaignId: string;
  date: Date;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  reach?: number;
  frequency?: number;
  videoViews?: number;
  engagements?: number;
  rawData?: any;
}

export interface NormalizedMetrics {
  campaignId: string;
  date: Date;
  platform: Platform;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  costPerClick: number;
  clickThroughRate: number;
  conversionRate: number;
  costPerConversion: number;
  returnOnAdSpend: number;
  reach?: number;
  frequency?: number;
  cpm: number;
  videoViews?: number;
  videoViewRate?: number;
  engagements?: number;
  engagementRate?: number;
  qualityScore?: number;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface CurrencyConversion {
  from: string;
  to: string;
  rate: number;
  date: Date;
}

/**
 * Normalize metrics from different platforms to a consistent format
 */
export const normalizeMetrics = (metrics: PlatformMetrics): NormalizedMetrics => {
  const {
    campaignId,
    date,
    platform,
    spend,
    clicks,
    impressions,
    conversions,
    reach,
    frequency,
    videoViews,
    engagements,
    rawData
  } = metrics;

  // Calculate derived metrics
  const costPerClick = clicks > 0 ? spend / clicks : 0;
  const clickThroughRate = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : 0;
  const costPerConversion = conversions > 0 ? spend / conversions : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  
  // Platform-specific ROAS calculation
  let returnOnAdSpend = 0;
  if (spend > 0) {
    switch (platform) {
      case 'GOOGLE_ADS':
        // Google Ads typically provides conversion value
        const conversionValue = rawData?.conversionValue || conversions * 50; // Default $50 per conversion
        returnOnAdSpend = conversionValue / spend;
        break;
      case 'FACEBOOK_ADS':
      case 'INSTAGRAM_ADS':
        // Facebook provides purchase ROAS
        returnOnAdSpend = rawData?.purchaseRoas || (conversions * 40) / spend; // Default $40 per conversion
        break;
      case 'TIKTOK_ADS':
        returnOnAdSpend = rawData?.roas || (conversions * 30) / spend; // Default $30 per conversion
        break;
      default:
        returnOnAdSpend = conversions > 0 ? (conversions * 35) / spend : 0; // Default $35 per conversion
    }
  }

  // Calculate video-specific metrics
  const videoViewRate = videoViews && impressions > 0 ? (videoViews / impressions) * 100 : undefined;
  
  // Calculate engagement metrics
  const engagementRate = engagements && impressions > 0 ? (engagements / impressions) * 100 : undefined;

  // Platform-specific quality score
  const qualityScore = calculateQualityScore(platform, {
    ctr: clickThroughRate,
    cvr: conversionRate,
    cpc: costPerClick,
    rawData
  });

  return {
    campaignId,
    date,
    platform,
    spend: roundToDecimal(spend, 2),
    clicks: Math.round(clicks),
    impressions: Math.round(impressions),
    conversions: roundToDecimal(conversions, 2),
    costPerClick: roundToDecimal(costPerClick, 4),
    clickThroughRate: roundToDecimal(clickThroughRate, 2),
    conversionRate: roundToDecimal(conversionRate, 2),
    costPerConversion: roundToDecimal(costPerConversion, 2),
    returnOnAdSpend: roundToDecimal(returnOnAdSpend, 2),
    reach: reach ? Math.round(reach) : undefined,
    frequency: frequency ? roundToDecimal(frequency, 2) : undefined,
    cpm: roundToDecimal(cpm, 2),
    videoViews: videoViews ? Math.round(videoViews) : undefined,
    videoViewRate: videoViewRate ? roundToDecimal(videoViewRate, 2) : undefined,
    engagements: engagements ? Math.round(engagements) : undefined,
    engagementRate: engagementRate ? roundToDecimal(engagementRate, 2) : undefined,
    qualityScore: qualityScore ? roundToDecimal(qualityScore, 1) : undefined
  };
};

/**
 * Calculate quality score based on platform-specific factors
 */
const calculateQualityScore = (
  platform: Platform,
  metrics: {
    ctr: number;
    cvr: number;
    cpc: number;
    rawData?: any;
  }
): number | undefined => {
  const { ctr, cvr, cpc, rawData } = metrics;

  switch (platform) {
    case 'GOOGLE_ADS':
      // Google Ads provides quality score directly
      return rawData?.qualityScore || calculateGenericQualityScore(ctr, cvr, cpc);
    
    case 'FACEBOOK_ADS':
    case 'INSTAGRAM_ADS':
      // Facebook uses relevance score (1-10)
      return rawData?.relevanceScore || calculateGenericQualityScore(ctr, cvr, cpc);
    
    default:
      return calculateGenericQualityScore(ctr, cvr, cpc);
  }
};

/**
 * Calculate generic quality score based on performance metrics
 */
const calculateGenericQualityScore = (ctr: number, cvr: number, cpc: number): number => {
  // Weighted average of normalized metrics (0-10 scale)
  const ctrScore = Math.min(ctr * 2, 10); // CTR > 5% = 10 points
  const cvrScore = Math.min(cvr * 5, 10); // CVR > 2% = 10 points
  const cpcScore = Math.max(10 - (cpc * 2), 0); // Lower CPC = higher score
  
  return (ctrScore * 0.4 + cvrScore * 0.4 + cpcScore * 0.2);
};

/**
 * Normalize currency values to a base currency (USD)
 */
export const normalizeCurrency = async (
  amount: number,
  fromCurrency: string,
  toCurrency: string = 'USD',
  date?: Date
): Promise<number> => {
  if (fromCurrency === toCurrency) {
    return amount;
  }

  try {
    // In a real implementation, you would fetch exchange rates from an API
    // For now, we'll use mock rates
    const exchangeRates: Record<string, number> = {
      'EUR': 1.1,
      'GBP': 1.25,
      'JPY': 0.0075,
      'CAD': 0.8,
      'AUD': 0.7,
      'BRL': 0.2,
      'MXN': 0.05,
      'USD': 1.0
    };

    const rate = exchangeRates[fromCurrency] || 1;
    return roundToDecimal(amount * rate, 2);

  } catch (error) {
    logger.warn(`Currency conversion failed for ${fromCurrency} to ${toCurrency}:`, error);
    return amount; // Return original amount if conversion fails
  }
};

/**
 * Validate and normalize date ranges
 */
export const validateDateRange = (startDate: Date, endDate: Date): DateRange => {
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Validate dates
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid date format');
  }

  if (start > end) {
    throw new Error('Start date must be before end date');
  }

  // Normalize to start/end of day
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  // Limit to maximum range (e.g., 2 years)
  const maxRangeMs = 2 * 365 * 24 * 60 * 60 * 1000;
  if (end.getTime() - start.getTime() > maxRangeMs) {
    throw new Error('Date range cannot exceed 2 years');
  }

  return { startDate: start, endDate: end };
};

/**
 * Format metrics for display
 */
export const formatMetrics = (metrics: NormalizedMetrics) => {
  return {
    ...metrics,
    spend: formatCurrency(metrics.spend),
    costPerClick: formatCurrency(metrics.costPerClick),
    costPerConversion: formatCurrency(metrics.costPerConversion),
    cpm: formatCurrency(metrics.cpm),
    clickThroughRate: formatPercentage(metrics.clickThroughRate),
    conversionRate: formatPercentage(metrics.conversionRate),
    videoViewRate: metrics.videoViewRate ? formatPercentage(metrics.videoViewRate) : undefined,
    engagementRate: metrics.engagementRate ? formatPercentage(metrics.engagementRate) : undefined,
    clicks: formatNumber(metrics.clicks),
    impressions: formatNumber(metrics.impressions),
    reach: metrics.reach ? formatNumber(metrics.reach) : undefined,
    videoViews: metrics.videoViews ? formatNumber(metrics.videoViews) : undefined,
    engagements: metrics.engagements ? formatNumber(metrics.engagements) : undefined
  };
};

/**
 * Aggregate metrics across multiple campaigns or time periods
 */
export const aggregateMetrics = (metrics: NormalizedMetrics[]): NormalizedMetrics => {
  if (metrics.length === 0) {
    throw new Error('Cannot aggregate empty metrics array');
  }

  const totals = metrics.reduce(
    (acc, metric) => ({
      spend: acc.spend + metric.spend,
      clicks: acc.clicks + metric.clicks,
      impressions: acc.impressions + metric.impressions,
      conversions: acc.conversions + metric.conversions,
      reach: (acc.reach || 0) + (metric.reach || 0),
      videoViews: (acc.videoViews || 0) + (metric.videoViews || 0),
      engagements: (acc.engagements || 0) + (metric.engagements || 0)
    }),
    {
      spend: 0,
      clicks: 0,
      impressions: 0,
      conversions: 0,
      reach: 0,
      videoViews: 0,
      engagements: 0
    }
  );

  // Calculate aggregated derived metrics
  const costPerClick = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  const clickThroughRate = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const conversionRate = totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0;
  const costPerConversion = totals.conversions > 0 ? totals.spend / totals.conversions : 0;
  const cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;

  // Calculate weighted average ROAS
  const totalRevenue = metrics.reduce((sum, m) => sum + (m.returnOnAdSpend * m.spend), 0);
  const returnOnAdSpend = totals.spend > 0 ? totalRevenue / totals.spend : 0;

  return {
    campaignId: 'aggregated',
    date: new Date(),
    platform: 'MULTIPLE' as Platform,
    spend: roundToDecimal(totals.spend, 2),
    clicks: totals.clicks,
    impressions: totals.impressions,
    conversions: roundToDecimal(totals.conversions, 2),
    costPerClick: roundToDecimal(costPerClick, 4),
    clickThroughRate: roundToDecimal(clickThroughRate, 2),
    conversionRate: roundToDecimal(conversionRate, 2),
    costPerConversion: roundToDecimal(costPerConversion, 2),
    returnOnAdSpend: roundToDecimal(returnOnAdSpend, 2),
    reach: totals.reach > 0 ? totals.reach : undefined,
    cpm: roundToDecimal(cpm, 2),
    videoViews: totals.videoViews > 0 ? totals.videoViews : undefined,
    engagements: totals.engagements > 0 ? totals.engagements : undefined
  };
};

/**
 * Detect and handle data anomalies
 */
export const detectAnomalies = (metrics: NormalizedMetrics[]): {
  anomalies: Array<{
    type: string;
    description: string;
    affectedMetrics: string[];
    severity: 'low' | 'medium' | 'high';
  }>;
  cleanedMetrics: NormalizedMetrics[];
} => {
  const anomalies: Array<{
    type: string;
    description: string;
    affectedMetrics: string[];
    severity: 'low' | 'medium' | 'high';
  }> = [];

  const cleanedMetrics = metrics.filter(metric => {
    let isValid = true;

    // Check for impossible values
    if (metric.spend < 0 || metric.clicks < 0 || metric.impressions < 0 || metric.conversions < 0) {
      anomalies.push({
        type: 'negative_values',
        description: `Negative values detected for ${metric.campaignId} on ${metric.date.toDateString()}`,
        affectedMetrics: ['spend', 'clicks', 'impressions', 'conversions'],
        severity: 'high'
      });
      isValid = false;
    }

    // Check for impossible ratios
    if (metric.clicks > metric.impressions) {
      anomalies.push({
        type: 'impossible_ratio',
        description: `Clicks exceed impressions for ${metric.campaignId}`,
        affectedMetrics: ['clicks', 'impressions'],
        severity: 'high'
      });
      isValid = false;
    }

    if (metric.conversions > metric.clicks) {
      anomalies.push({
        type: 'impossible_ratio',
        description: `Conversions exceed clicks for ${metric.campaignId}`,
        affectedMetrics: ['conversions', 'clicks'],
        severity: 'medium'
      });
      // Don't filter out, but flag as anomaly
    }

    // Check for unrealistic CTR
    if (metric.clickThroughRate > 50) {
      anomalies.push({
        type: 'unrealistic_ctr',
        description: `Unusually high CTR (${metric.clickThroughRate}%) for ${metric.campaignId}`,
        affectedMetrics: ['clickThroughRate'],
        severity: 'medium'
      });
    }

    // Check for unrealistic CPC
    if (metric.costPerClick > 1000) {
      anomalies.push({
        type: 'unrealistic_cpc',
        description: `Unusually high CPC ($${metric.costPerClick}) for ${metric.campaignId}`,
        affectedMetrics: ['costPerClick'],
        severity: 'medium'
      });
    }

    return isValid;
  });

  return { anomalies, cleanedMetrics };
};

/**
 * Fill missing data points in time series
 */
export const fillMissingData = (
  metrics: NormalizedMetrics[],
  startDate: Date,
  endDate: Date,
  fillMethod: 'zero' | 'forward' | 'interpolate' = 'zero'
): NormalizedMetrics[] => {
  if (metrics.length === 0) return [];

  const sortedMetrics = metrics.sort((a, b) => a.date.getTime() - b.date.getTime());
  const filledMetrics: NormalizedMetrics[] = [];
  
  const currentDate = new Date(startDate);
  let metricIndex = 0;

  while (currentDate <= endDate) {
    const dateString = currentDate.toDateString();
    const existingMetric = sortedMetrics.find(m => m.date.toDateString() === dateString);

    if (existingMetric) {
      filledMetrics.push(existingMetric);
      metricIndex++;
    } else {
      // Create missing data point based on fill method
      let fillData: Partial<NormalizedMetrics>;

      switch (fillMethod) {
        case 'forward':
          fillData = filledMetrics.length > 0 ? { ...filledMetrics[filledMetrics.length - 1] } : {};
          break;
        case 'interpolate':
          // Simple linear interpolation (would need more sophisticated implementation)
          fillData = filledMetrics.length > 0 ? { ...filledMetrics[filledMetrics.length - 1] } : {};
          break;
        default:
          fillData = {};
      }

      filledMetrics.push({
        campaignId: sortedMetrics[0].campaignId,
        date: new Date(currentDate),
        platform: sortedMetrics[0].platform,
        spend: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        costPerClick: 0,
        clickThroughRate: 0,
        conversionRate: 0,
        costPerConversion: 0,
        returnOnAdSpend: 0,
        cpm: 0,
        ...fillData
      });
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return filledMetrics;
};

// Helper functions

/**
 * Round number to specified decimal places
 */
const roundToDecimal = (num: number, decimals: number): number => {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
};

/**
 * Format currency values
 */
const formatCurrency = (amount: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

/**
 * Format percentage values
 */
const formatPercentage = (value: number): string => {
  return `${roundToDecimal(value, 2)}%`;
};

/**
 * Format large numbers with abbreviations
 */
const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return `${roundToDecimal(num / 1000000, 1)}M`;
  } else if (num >= 1000) {
    return `${roundToDecimal(num / 1000, 1)}K`;
  }
  return num.toString();
};

/**
 * Compare metrics between two periods
 */
export const compareMetrics = (
  current: NormalizedMetrics[],
  previous: NormalizedMetrics[]
): {
  spend: { value: number; change: number; changePercent: number };
  clicks: { value: number; change: number; changePercent: number };
  conversions: { value: number; change: number; changePercent: number };
  roas: { value: number; change: number; changePercent: number };
} => {
  const currentAgg = aggregateMetrics(current);
  const previousAgg = aggregateMetrics(previous);

  return {
    spend: {
      value: currentAgg.spend,
      change: currentAgg.spend - previousAgg.spend,
      changePercent: previousAgg.spend > 0 ? ((currentAgg.spend - previousAgg.spend) / previousAgg.spend) * 100 : 0
    },
    clicks: {
      value: currentAgg.clicks,
      change: currentAgg.clicks - previousAgg.clicks,
      changePercent: previousAgg.clicks > 0 ? ((currentAgg.clicks - previousAgg.clicks) / previousAgg.clicks) * 100 : 0
    },
    conversions: {
      value: currentAgg.conversions,
      change: currentAgg.conversions - previousAgg.conversions,
      changePercent: previousAgg.conversions > 0 ? ((currentAgg.conversions - previousAgg.conversions) / previousAgg.conversions) * 100 : 0
    },
    roas: {
      value: currentAgg.returnOnAdSpend,
      change: currentAgg.returnOnAdSpend - previousAgg.returnOnAdSpend,
      changePercent: previousAgg.returnOnAdSpend > 0 ? ((currentAgg.returnOnAdSpend - previousAgg.returnOnAdSpend) / previousAgg.returnOnAdSpend) * 100 : 0
    }
  };
};