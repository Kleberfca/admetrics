import { logger } from '../utils/logger';
import type { CampaignData, MetricData } from '../types/integration.types';

export interface DataQualityReport {
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  errorRate: number;
  issues: DataQualityIssue[];
  recommendations: string[];
}

export interface DataQualityIssue {
  type: 'missing_data' | 'invalid_format' | 'outlier' | 'inconsistency' | 'duplicate';
  field: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedRecords: number;
  suggestedAction: string;
}

export interface ValidationRule {
  field: string;
  type: 'required' | 'numeric' | 'date' | 'enum' | 'range' | 'pattern';
  params?: any;
  message: string;
}

export class DataQualityService {
  private campaignValidationRules: ValidationRule[] = [
    {
      field: 'externalId',
      type: 'required',
      message: 'Campaign external ID is required'
    },
    {
      field: 'name',
      type: 'required',
      message: 'Campaign name is required'
    },
    {
      field: 'platform',
      type: 'enum',
      params: ['GOOGLE_ADS', 'FACEBOOK_ADS', 'INSTAGRAM_ADS', 'TIKTOK_ADS', 'LINKEDIN_ADS'],
      message: 'Invalid platform value'
    },
    {
      field: 'budget',
      type: 'numeric',
      params: { min: 0, max: 1000000 },
      message: 'Budget must be a positive number'
    },
    {
      field: 'startDate',
      type: 'date',
      message: 'Invalid start date format'
    },
    {
      field: 'endDate',
      type: 'date',
      message: 'Invalid end date format'
    }
  ];

  private metricsValidationRules: ValidationRule[] = [
    {
      field: 'campaignId',
      type: 'required',
      message: 'Campaign ID is required'
    },
    {
      field: 'date',
      type: 'date',
      message: 'Invalid date format'
    },
    {
      field: 'platform',
      type: 'enum',
      params: ['GOOGLE_ADS', 'FACEBOOK_ADS', 'INSTAGRAM_ADS', 'TIKTOK_ADS', 'LINKEDIN_ADS'],
      message: 'Invalid platform value'
    },
    {
      field: 'impressions',
      type: 'numeric',
      params: { min: 0, max: 10000000 },
      message: 'Impressions must be a non-negative number'
    },
    {
      field: 'clicks',
      type: 'numeric',
      params: { min: 0, max: 1000000 },
      message: 'Clicks must be a non-negative number'
    },
    {
      field: 'spend',
      type: 'numeric',
      params: { min: 0, max: 100000 },
      message: 'Spend must be a non-negative number'
    },
    {
      field: 'conversions',
      type: 'numeric',
      params: { min: 0, max: 100000 },
      message: 'Conversions must be a non-negative number'
    },
    {
      field: 'ctr',
      type: 'range',
      params: { min: 0, max: 100 },
      message: 'CTR must be between 0 and 100'
    },
    {
      field: 'cpc',
      type: 'numeric',
      params: { min: 0, max: 1000 },
      message: 'CPC must be a positive number'
    },
    {
      field: 'roas',
      type: 'numeric',
      params: { min: 0, max: 50 },
      message: 'ROAS must be a positive number'
    }
  ];

  /**
   * Validate campaign data
   */
  async validateCampaigns(campaigns: CampaignData[]): Promise<CampaignData[]> {
    logger.info(`Validating ${campaigns.length} campaigns`);
    
    const validCampaigns: CampaignData[] = [];
    const issues: DataQualityIssue[] = [];

    for (const campaign of campaigns) {
      const campaignIssues = this.validateCampaign(campaign);
      
      if (campaignIssues.length === 0) {
        validCampaigns.push(this.cleanCampaignData(campaign));
      } else {
        issues.push(...campaignIssues);
        
        // Try to fix minor issues
        const fixedCampaign = this.attemptCampaignFix(campaign, campaignIssues);
        if (fixedCampaign) {
          validCampaigns.push(fixedCampaign);
        }
      }
    }

    if (issues.length > 0) {
      logger.warn(`Found ${issues.length} data quality issues in campaigns`);
      this.logDataQualityIssues(issues);
    }

    logger.info(`Validated campaigns: ${validCampaigns.length}/${campaigns.length} passed`);
    return validCampaigns;
  }

  /**
   * Validate metrics data
   */
  async validateMetrics(metrics: MetricData[]): Promise<MetricData[]> {
    logger.info(`Validating ${metrics.length} metric records`);
    
    const validMetrics: MetricData[] = [];
    const issues: DataQualityIssue[] = [];

    for (const metric of metrics) {
      const metricIssues = this.validateMetric(metric);
      
      if (metricIssues.length === 0) {
        validMetrics.push(this.cleanMetricData(metric));
      } else {
        issues.push(...metricIssues);
        
        // Try to fix minor issues
        const fixedMetric = this.attemptMetricFix(metric, metricIssues);
        if (fixedMetric) {
          validMetrics.push(fixedMetric);
        }
      }
    }

    // Check for logical inconsistencies
    const consistencyIssues = this.checkMetricsConsistency(validMetrics);
    issues.push(...consistencyIssues);

    // Remove outliers
    const cleanedMetrics = this.removeOutliers(validMetrics);

    if (issues.length > 0) {
      logger.warn(`Found ${issues.length} data quality issues in metrics`);
      this.logDataQualityIssues(issues);
    }

    logger.info(`Validated metrics: ${cleanedMetrics.length}/${metrics.length} passed`);
    return cleanedMetrics;
  }

  /**
   * Generate data quality report
   */
  generateDataQualityReport(originalCount: number, validCount: number, issues: DataQualityIssue[]): DataQualityReport {
    const invalidCount = originalCount - validCount;
    const errorRate = (invalidCount / originalCount) * 100;

    const recommendations = this.generateRecommendations(issues);

    return {
      totalRecords: originalCount,
      validRecords: validCount,
      invalidRecords: invalidCount,
      errorRate: parseFloat(errorRate.toFixed(2)),
      issues,
      recommendations
    };
  }

  // Private validation methods

  private validateCampaign(campaign: CampaignData): DataQualityIssue[] {
    const issues: DataQualityIssue[] = [];

    for (const rule of this.campaignValidationRules) {
      const issue = this.validateField(campaign, rule, 'campaign');
      if (issue) {
        issues.push(issue);
      }
    }

    // Custom business logic validations
    if (campaign.startDate && campaign.endDate && campaign.startDate > campaign.endDate) {
      issues.push({
        type: 'inconsistency',
        field: 'dateRange',
        description: 'Start date is after end date',
        severity: 'high',
        affectedRecords: 1,
        suggestedAction: 'Check campaign date configuration'
      });
    }

    if (campaign.budget && campaign.budget < 0) {
      issues.push({
        type: 'invalid_format',
        field: 'budget',
        description: 'Negative budget value',
        severity: 'high',
        affectedRecords: 1,
        suggestedAction: 'Set budget to positive value'
      });
    }

    return issues;
  }

  private validateMetric(metric: MetricData): DataQualityIssue[] {
    const issues: DataQualityIssue[] = [];

    for (const rule of this.metricsValidationRules) {
      const issue = this.validateField(metric, rule, 'metric');
      if (issue) {
        issues.push(issue);
      }
    }

    // Logical consistency checks
    if (metric.clicks && metric.impressions && metric.clicks > metric.impressions) {
      issues.push({
        type: 'inconsistency',
        field: 'clicks_impressions',
        description: 'Clicks exceed impressions',
        severity: 'high',
        affectedRecords: 1,
        suggestedAction: 'Verify data source accuracy'
      });
    }

    if (metric.conversions && metric.clicks && metric.conversions > metric.clicks) {
      issues.push({
        type: 'inconsistency',
        field: 'conversions_clicks',
        description: 'Conversions exceed clicks',
        severity: 'high',
        affectedRecords: 1,
        suggestedAction: 'Check conversion tracking setup'
      });
    }

    if (metric.ctr && metric.clicks && metric.impressions) {
      const calculatedCTR = (Number(metric.clicks) / Number(metric.impressions)) * 100;
      const reportedCTR = Number(metric.ctr);
      
      if (Math.abs(calculatedCTR - reportedCTR) > 0.1) {
        issues.push({
          type: 'inconsistency',
          field: 'ctr',
          description: 'CTR does not match calculated value',
          severity: 'medium',
          affectedRecords: 1,
          suggestedAction: 'Recalculate CTR from impressions and clicks'
        });
      }
    }

    return issues;
  }

  private validateField(data: any, rule: ValidationRule, context: string): DataQualityIssue | null {
    const value = data[rule.field];

    switch (rule.type) {
      case 'required':
        if (value === undefined || value === null || value === '') {
          return {
            type: 'missing_data',
            field: rule.field,
            description: rule.message,
            severity: 'high',
            affectedRecords: 1,
            suggestedAction: `Provide ${rule.field} value`
          };
        }
        break;

      case 'numeric':
        if (value !== undefined && value !== null) {
          const numValue = Number(value);
          if (isNaN(numValue)) {
            return {
              type: 'invalid_format',
              field: rule.field,
              description: `${rule.field} must be numeric`,
              severity: 'high',
              affectedRecords: 1,
              suggestedAction: 'Convert to numeric format'
            };
          }
          
          if (rule.params?.min !== undefined && numValue < rule.params.min) {
            return {
              type: 'outlier',
              field: rule.field,
              description: `${rule.field} below minimum value (${rule.params.min})`,
              severity: 'medium',
              affectedRecords: 1,
              suggestedAction: `Set ${rule.field} to at least ${rule.params.min}`
            };
          }
          
          if (rule.params?.max !== undefined && numValue > rule.params.max) {
            return {
              type: 'outlier',
              field: rule.field,
              description: `${rule.field} above maximum value (${rule.params.max})`,
              severity: 'medium',
              affectedRecords: 1,
              suggestedAction: `Set ${rule.field} to at most ${rule.params.max}`
            };
          }
        }
        break;

      case 'date':
        if (value !== undefined && value !== null) {
          const dateValue = new Date(value);
          if (isNaN(dateValue.getTime())) {
            return {
              type: 'invalid_format',
              field: rule.field,
              description: `Invalid date format for ${rule.field}`,
              severity: 'high',
              affectedRecords: 1,
              suggestedAction: 'Use valid date format (ISO 8601)'
            };
          }
        }
        break;

      case 'enum':
        if (value !== undefined && value !== null && !rule.params?.includes(value)) {
          return {
            type: 'invalid_format',
            field: rule.field,
            description: `Invalid ${rule.field} value: ${value}`,
            severity: 'high',
            affectedRecords: 1,
            suggestedAction: `Use one of: ${rule.params?.join(', ')}`
          };
        }
        break;

      case 'range':
        if (value !== undefined && value !== null) {
          const numValue = Number(value);
          if (!isNaN(numValue)) {
            if (rule.params?.min !== undefined && numValue < rule.params.min) {
              return {
                type: 'outlier',
                field: rule.field,
                description: `${rule.field} below range minimum`,
                severity: 'medium',
                affectedRecords: 1,
                suggestedAction: `Set ${rule.field} within valid range`
              };
            }
            
            if (rule.params?.max !== undefined && numValue > rule.params.max) {
              return {
                type: 'outlier',
                field: rule.field,
                description: `${rule.field} above range maximum`,
                severity: 'medium',
                affectedRecords: 1,
                suggestedAction: `Set ${rule.field} within valid range`
              };
            }
          }
        }
        break;
    }

    return null;
  }

  private checkMetricsConsistency(metrics: MetricData[]): DataQualityIssue[] {
    const issues: DataQualityIssue[] = [];
    
    // Check for duplicate records
    const duplicates = this.findDuplicateMetrics(metrics);
    if (duplicates.length > 0) {
      issues.push({
        type: 'duplicate',
        field: 'record',
        description: `Found ${duplicates.length} duplicate metric records`,
        severity: 'medium',
        affectedRecords: duplicates.length,
        suggestedAction: 'Remove duplicate records'
      });
    }

    return issues;
  }

  private findDuplicateMetrics(metrics: MetricData[]): MetricData[] {
    const seen = new Set();
    const duplicates: MetricData[] = [];

    for (const metric of metrics) {
      const key = `${metric.campaignId}-${metric.date.toISOString()}-${metric.metricType}`;
      if (seen.has(key)) {
        duplicates.push(metric);
      } else {
        seen.add(key);
      }
    }

    return duplicates;
  }

  private removeOutliers(metrics: MetricData[]): MetricData[] {
    const numericFields = ['spend', 'cpc', 'cpm', 'ctr', 'roas'];
    const cleanedMetrics: MetricData[] = [];

    for (const metric of metrics) {
      let isOutlier = false;

      for (const field of numericFields) {
        const value = Number(metric[field as keyof MetricData]);
        if (!isNaN(value) && this.isStatisticalOutlier(value, metrics, field)) {
          isOutlier = true;
          break;
        }
      }

      if (!isOutlier) {
        cleanedMetrics.push(metric);
      }
    }

    const removedCount = metrics.length - cleanedMetrics.length;
    if (removedCount > 0) {
      logger.info(`Removed ${removedCount} outlier records`);
    }

    return cleanedMetrics;
  }

  private isStatisticalOutlier(value: number, data: MetricData[], field: string): boolean {
    const values = data
      .map(d => Number(d[field as keyof MetricData]))
      .filter(v => !isNaN(v));

    if (values.length < 10) return false; // Not enough data for outlier detection

    const q1 = this.percentile(values, 25);
    const q3 = this.percentile(values, 75);
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    return value < lowerBound || value > upperBound;
  }

  private percentile(values: number[], p: number): number {
    const sorted = values.slice().sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;

    if (upper >= sorted.length) return sorted[sorted.length - 1];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  private cleanCampaignData(campaign: CampaignData): CampaignData {
    // Trim string fields
    if (campaign.name) campaign.name = campaign.name.trim();
    
    // Ensure budget is properly formatted
    if (campaign.budget) {
      campaign.budget = parseFloat(campaign.budget.toString());
    }

    return campaign;
  }

  private cleanMetricData(metric: MetricData): MetricData {
    // Convert string numbers to proper types
    if (metric.spend) metric.spend = parseFloat(metric.spend.toString());
    if (metric.cpc) metric.cpc = parseFloat(metric.cpc.toString());
    if (metric.cpm) metric.cpm = parseFloat(metric.cpm.toString());
    if (metric.ctr) metric.ctr = parseFloat(metric.ctr.toString());
    if (metric.roas) metric.roas = parseFloat(metric.roas.toString());

    return metric;
  }

  private attemptCampaignFix(campaign: CampaignData, issues: DataQualityIssue[]): CampaignData | null {
    const fixedCampaign = { ...campaign };
    let canFix = true;

    for (const issue of issues) {
      if (issue.severity === 'critical') {
        canFix = false;
        break;
      }

      // Attempt simple fixes
      switch (issue.type) {
        case 'missing_data':
          if (issue.field === 'name' && fixedCampaign.externalId) {
            fixedCampaign.name = `Campaign ${fixedCampaign.externalId}`;
          }
          break;
        
        case 'outlier':
          if (issue.field === 'budget' && fixedCampaign.budget && fixedCampaign.budget < 0) {
            fixedCampaign.budget = Math.abs(fixedCampaign.budget);
          }
          break;
      }
    }

    return canFix ? fixedCampaign : null;
  }

  private attemptMetricFix(metric: MetricData, issues: DataQualityIssue[]): MetricData | null {
    const fixedMetric = { ...metric };
    let canFix = true;

    for (const issue of issues) {
      if (issue.severity === 'critical') {
        canFix = false;
        break;
      }

      // Attempt simple fixes
      switch (issue.type) {
        case 'inconsistency':
          if (issue.field === 'ctr' && fixedMetric.clicks && fixedMetric.impressions) {
            fixedMetric.ctr = (Number(fixedMetric.clicks) / Number(fixedMetric.impressions)) * 100;
          }
          break;
      }
    }

    return canFix ? fixedMetric : null;
  }

  private generateRecommendations(issues: DataQualityIssue[]): string[] {
    const recommendations: string[] = [];
    const issueTypes = [...new Set(issues.map(i => i.type))];

    if (issueTypes.includes('missing_data')) {
      recommendations.push('Implement data validation at the source to prevent missing required fields');
    }

    if (issueTypes.includes('invalid_format')) {
      recommendations.push('Add data type validation and conversion routines');
    }

    if (issueTypes.includes('outlier')) {
      recommendations.push('Review data collection processes and implement outlier detection');
    }

    if (issueTypes.includes('inconsistency')) {
      recommendations.push('Add cross-field validation rules to ensure data consistency');
    }

    if (issueTypes.includes('duplicate')) {
      recommendations.push('Implement deduplication logic in data pipeline');
    }

    return recommendations;
  }

  private logDataQualityIssues(issues: DataQualityIssue[]): void {
    const issuesByType = issues.reduce((acc, issue) => {
      if (!acc[issue.type]) acc[issue.type] = [];
      acc[issue.type].push(issue);
      return acc;
    }, {} as Record<string, DataQualityIssue[]>);

    for (const [type, typeIssues] of Object.entries(issuesByType)) {
      logger.warn(`${type}: ${typeIssues.length} issues found`);
      
      // Log most severe issues
      const criticalIssues = typeIssues.filter(i => i.severity === 'critical');
      if (criticalIssues.length > 0) {
        logger.error(`Critical ${type} issues:`, criticalIssues.map(i => i.description));
      }
    }
  }
}