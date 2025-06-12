// frontend/src/hooks/useDashboard.ts
import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiService } from '../services/api.service';
import { useAuthStore } from '../store/auth.store';
import type { DateRange, Platform, DashboardOverview, MetricsData } from '../types';

interface DashboardFilters {
  dateRange: DateRange;
  platforms: Platform[];
  campaigns?: string[];
}

interface DashboardPreferences {
  defaultDateRange: DateRange;
  selectedPlatforms: Platform[];
  refreshInterval: number;
  autoRefresh: boolean;
  compactView: boolean;
  showAdvancedMetrics: boolean;
  defaultGranularity: 'hour' | 'day' | 'week' | 'month';
}

interface UseDashboardReturn {
  // Data
  overview: DashboardOverview | undefined;
  metrics: MetricsData | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  
  // Filters
  filters: DashboardFilters;
  setFilters: (filters: Partial<DashboardFilters>) => void;
  resetFilters: () => void;
  
  // Preferences
  preferences: DashboardPreferences;
  updatePreferences: (preferences: Partial<DashboardPreferences>) => void;
  
  // Actions
  refresh: () => Promise<void>;
  exportData: (format?: 'csv' | 'json') => Promise<void>;
  
  // Utilities
  getDateRangeLabel: () => string;
  getPlatformLabels: () => string[];
  isDataStale: () => boolean;
  getLastUpdateTime: () => Date | null;
}

const defaultDateRange: DateRange = {
  startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
  endDate: new Date()
};

const defaultPlatforms: Platform[] = ['GOOGLE_ADS', 'FACEBOOK_ADS', 'INSTAGRAM_ADS'];

const defaultPreferences: DashboardPreferences = {
  defaultDateRange,
  selectedPlatforms: defaultPlatforms,
  refreshInterval: 5 * 60 * 1000, // 5 minutes
  autoRefresh: true,
  compactView: false,
  showAdvancedMetrics: false,
  defaultGranularity: 'day'
};

export const useDashboard = (): UseDashboardReturn => {
  const queryClient = useQueryClient();
  const { user, updatePreferences: updateAuthPreferences } = useAuthStore();
  
  // State
  const [filters, setFiltersState] = useState<DashboardFilters>({
    dateRange: defaultDateRange,
    platforms: defaultPlatforms,
    campaigns: undefined
  });

  const [preferences, setPreferencesState] = useState<DashboardPreferences>(() => {
    // Load preferences from user profile or localStorage
    const userPrefs = user?.preferences?.dashboard;
    const localPrefs = localStorage.getItem('dashboard-preferences');
    
    if (userPrefs) {
      return { ...defaultPreferences, ...userPrefs };
    } else if (localPrefs) {
      try {
        return { ...defaultPreferences, ...JSON.parse(localPrefs) };
      } catch {
        return defaultPreferences;
      }
    }
    
    return defaultPreferences;
  });

  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);

  // Fetch dashboard overview
  const {
    data: overview,
    isLoading: isOverviewLoading,
    error: overviewError,
    refetch: refetchOverview,
    dataUpdatedAt: overviewUpdatedAt
  } = useQuery({
    queryKey: ['dashboard', 'overview', filters.dateRange, filters.platforms, filters.campaigns],
    queryFn: () => apiService.getDashboardOverview({
      startDate: filters.dateRange.startDate.toISOString(),
      endDate: filters.dateRange.endDate.toISOString(),
      platforms: filters.platforms,
      campaigns: filters.campaigns
    }),
    staleTime: preferences.refreshInterval,
    refetchInterval: preferences.autoRefresh ? preferences.refreshInterval : false,
    refetchIntervalInBackground: true,
    onSuccess: () => {
      setLastUpdateTime(new Date());
    },
    onError: (error) => {
      console.error('Dashboard overview error:', error);
      toast.error('Failed to load dashboard data');
    }
  });

  // Fetch detailed metrics
  const {
    data: metrics,
    isLoading: isMetricsLoading,
    error: metricsError,
    refetch: refetchMetrics
  } = useQuery({
    queryKey: ['dashboard', 'metrics', filters.dateRange, filters.platforms, filters.campaigns, preferences.defaultGranularity],
    queryFn: () => apiService.getDashboardMetrics({
      startDate: filters.dateRange.startDate.toISOString(),
      endDate: filters.dateRange.endDate.toISOString(),
      platforms: filters.platforms,
      campaigns: filters.campaigns,
      granularity: preferences.defaultGranularity
    }),
    staleTime: preferences.refreshInterval,
    refetchInterval: preferences.autoRefresh ? preferences.refreshInterval : false,
    enabled: !!overview, // Only fetch after overview is loaded
    onError: (error) => {
      console.error('Dashboard metrics error:', error);
    }
  });

  // Combined loading and error states
  const isLoading = isOverviewLoading || isMetricsLoading;
  const isError = !!overviewError || !!metricsError;
  const error = overviewError || metricsError;

  // Actions
  const setFilters = useCallback((newFilters: Partial<DashboardFilters>) => {
    setFiltersState(prev => ({ ...prev, ...newFilters }));
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState({
      dateRange: preferences.defaultDateRange,
      platforms: preferences.selectedPlatforms,
      campaigns: undefined
    });
  }, [preferences]);

  const updatePreferences = useCallback(async (newPreferences: Partial<DashboardPreferences>) => {
    const updated = { ...preferences, ...newPreferences };
    setPreferencesState(updated);
    
    // Save to localStorage
    localStorage.setItem('dashboard-preferences', JSON.stringify(updated));
    
    // Save to user profile if authenticated
    if (user) {
      try {
        await updateAuthPreferences({
          dashboard: updated
        });
      } catch (error) {
        console.warn('Failed to save dashboard preferences to profile:', error);
      }
    }
  }, [preferences, user, updateAuthPreferences]);

  const refresh = useCallback(async () => {
    try {
      await Promise.all([
        refetchOverview(),
        refetchMetrics()
      ]);
      setLastUpdateTime(new Date());
      toast.success('Dashboard refreshed');
    } catch (error) {
      toast.error('Failed to refresh dashboard');
      throw error;
    }
  }, [refetchOverview, refetchMetrics]);

  const exportData = useCallback(async (format: 'csv' | 'json' = 'csv') => {
    try {
      toast.loading('Exporting data...');
      
      const data = await apiService.exportDashboardData({
        startDate: filters.dateRange.startDate.toISOString(),
        endDate: filters.dateRange.endDate.toISOString(),
        platforms: filters.platforms,
        format
      });

      // Create download link
      const blob = new Blob([data], { 
        type: format === 'csv' ? 'text/csv' : 'application/json' 
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dashboard-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.dismiss();
      toast.success('Data exported successfully');
    } catch (error) {
      toast.dismiss();
      toast.error('Failed to export data');
      throw error;
    }
  }, [filters]);

  // Utility functions
  const getDateRangeLabel = useCallback(() => {
    const { startDate, endDate } = filters.dateRange;
    const now = new Date();
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff === 1) {
      return 'Today';
    } else if (daysDiff === 7) {
      return 'Last 7 days';
    } else if (daysDiff === 30) {
      return 'Last 30 days';
    } else if (daysDiff === 90) {
      return 'Last 90 days';
    } else {
      return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
    }
  }, [filters.dateRange]);

  const getPlatformLabels = useCallback(() => {
    const platformNames: Record<Platform, string> = {
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

    return filters.platforms.map(platform => platformNames[platform]);
  }, [filters.platforms]);

  const isDataStale = useCallback(() => {
    if (!lastUpdateTime) return true;
    
    const staleTime = new Date(lastUpdateTime.getTime() + preferences.refreshInterval);
    return new Date() > staleTime;
  }, [lastUpdateTime, preferences.refreshInterval]);

  const getLastUpdateTime = useCallback(() => {
    return lastUpdateTime || (overviewUpdatedAt ? new Date(overviewUpdatedAt) : null);
  }, [lastUpdateTime, overviewUpdatedAt]);

  // Auto-refresh based on preferences
  useEffect(() => {
    if (!preferences.autoRefresh) return;

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !isLoading) {
        refetchOverview();
        refetchMetrics();
        setLastUpdateTime(new Date());
      }
    }, preferences.refreshInterval);

    return () => clearInterval(interval);
  }, [preferences.autoRefresh, preferences.refreshInterval, isLoading, refetchOverview, refetchMetrics]);

  // Handle visibility change for performance
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && preferences.autoRefresh && isDataStale()) {
        refresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [preferences.autoRefresh, isDataStale, refresh]);

  // Update filters when preferences change
  useEffect(() => {
    setFiltersState(prev => ({
      ...prev,
      dateRange: preferences.defaultDateRange,
      platforms: preferences.selectedPlatforms
    }));
  }, [preferences.defaultDateRange, preferences.selectedPlatforms]);

  // Prefetch related data
  useEffect(() => {
    if (overview?.topCampaigns) {
      // Prefetch individual campaign data for top campaigns
      overview.topCampaigns.forEach(campaign => {
        queryClient.prefetchQuery({
          queryKey: ['campaign', campaign.id],
          queryFn: () => apiService.getCampaign(campaign.id),
          staleTime: 10 * 60 * 1000 // 10 minutes
        });
      });
    }
  }, [overview, queryClient]);

  return {
    // Data
    overview,
    metrics,
    isLoading,
    isError,
    error,
    
    // Filters
    filters,
    setFilters,
    resetFilters,
    
    // Preferences
    preferences,
    updatePreferences,
    
    // Actions
    refresh,
    exportData,
    
    // Utilities
    getDateRangeLabel,
    getPlatformLabels,
    isDataStale,
    getLastUpdateTime
  };
};

// Specialized hooks for specific dashboard features
export const useDashboardMetrics = () => {
  const { overview, metrics, isLoading } = useDashboard();
  
  return {
    current: overview?.summary.current,
    previous: overview?.summary.previous,
    change: overview?.summary.change,
    trends: metrics,
    isLoading
  };
};

export const useDashboardCampaigns = () => {
  const { overview, isLoading } = useDashboard();
  
  return {
    total: overview?.campaigns.total || 0,
    active: overview?.campaigns.active || 0,
    paused: overview?.campaigns.paused || 0,
    topCampaigns: overview?.topCampaigns || [],
    isLoading
  };
};

export const useDashboardAlerts = () => {
  const { overview, isLoading } = useDashboard();
  
  return {
    total: overview?.alerts.total || 0,
    unread: overview?.alerts.unread || 0,
    recent: overview?.alerts.recent || [],
    isLoading
  };
};

export default useDashboard;