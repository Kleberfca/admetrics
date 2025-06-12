// frontend/src/pages/Dashboard/index.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import {
  ChartBarIcon,
  CurrencyDollarIcon,
  EyeIcon,
  CursorArrowRaysIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ExclamationTriangleIcon,
  LightBulbIcon,
  CalendarIcon,
  FunnelIcon,
  ArrowPathIcon,
  DocumentArrowDownIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

// Components
import MetricCard from '../../components/dashboard/MetricCard';
import PerformanceChart from '../../components/charts/PerformanceChart';
import PlatformComparison from '../../components/charts/PlatformComparison';
import CampaignTable from '../../components/campaigns/CampaignTable';
import AIInsightCard from '../../components/ai/AIInsightCard';
import DateRangePicker from '../../components/common/DateRangePicker';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorAlert from '../../components/common/ErrorAlert';
import PlatformFilter from '../../components/filters/PlatformFilter';
import AlertsList from '../../components/alerts/AlertsList';

// Hooks and Services
import { useRealTimeMetrics } from '../../hooks/useRealTimeMetrics';
import { useDashboard } from '../../hooks/useDashboard';
import { apiService } from '../../services/api.service';

// Types
import { DateRange, Platform } from '../../types/common.types';
import { DashboardOverview, MetricsData } from '../../types/dashboard.types';

// Utils
import { formatCurrency, formatNumber, formatPercentage } from '../../utils/formatters';
import { calculatePercentageChange, getTrendDirection } from '../../utils/calculations';

const Dashboard: React.FC = () => {
  // State
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
    endDate: new Date()
  });

  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([
    'GOOGLE_ADS',
    'FACEBOOK_ADS',
    'INSTAGRAM_ADS'
  ]);

  const [isExporting, setIsExporting] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState<number>(300000); // 5 minutes

  const queryClient = useQueryClient();

  // Custom hooks
  const { preferences, updatePreferences } = useDashboard();

  // Real-time metrics
  const realTimeMetrics = useRealTimeMetrics({
    enabled: true,
    platforms: selectedPlatforms,
    interval: refreshInterval
  });

  // Fetch dashboard overview
  const {
    data: dashboardData,
    isLoading: isDashboardLoading,
    error: dashboardError,
    refetch: refetchDashboard,
    isFetching: isDashboardFetching
  } = useQuery<DashboardOverview>({
    queryKey: ['dashboard', 'overview', dateRange, selectedPlatforms],
    queryFn: () => apiService.getDashboardOverview({
      startDate: dateRange.startDate.toISOString(),
      endDate: dateRange.endDate.toISOString(),
      platforms: selectedPlatforms
    }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: refreshInterval,
    refetchIntervalInBackground: true
  });

  // Fetch AI insights
  const {
    data: aiInsights,
    isLoading: isInsightsLoading,
    refetch: refetchInsights
  } = useQuery({
    queryKey: ['ai-insights', dateRange],
    queryFn: () => apiService.getAIInsights({
      startDate: dateRange.startDate.toISOString(),
      endDate: dateRange.endDate.toISOString()
    }),
    staleTime: 15 * 60 * 1000, // 15 minutes
    enabled: !!dashboardData // Only fetch after dashboard data is loaded
  });

  // Memoized calculations
  const metrics = useMemo(() => {
    if (!dashboardData) return null;

    const current = dashboardData.summary.current;
    const previous = dashboardData.summary.previous;

    return {
      spend: {
        current: current.totalSpend,
        previous: previous.totalSpend,
        change: calculatePercentageChange(current.totalSpend, previous.totalSpend),
        trend: getTrendDirection(current.totalSpend, previous.totalSpend)
      },
      clicks: {
        current: current.totalClicks,
        previous: previous.totalClicks,
        change: calculatePercentageChange(current.totalClicks, previous.totalClicks),
        trend: getTrendDirection(current.totalClicks, previous.totalClicks)
      },
      conversions: {
        current: current.totalConversions,
        previous: previous.totalConversions,
        change: calculatePercentageChange(current.totalConversions, previous.totalConversions),
        trend: getTrendDirection(current.totalConversions, previous.totalConversions)
      },
      roas: {
        current: current.averageROAS,
        previous: previous.averageROAS,
        change: calculatePercentageChange(current.averageROAS, previous.averageROAS),
        trend: getTrendDirection(current.averageROAS, previous.averageROAS)
      },
      cpc: {
        current: current.averageCPC,
        previous: previous.averageCPC,
        change: calculatePercentageChange(current.averageCPC, previous.averageCPC),
        trend: getTrendDirection(previous.averageCPC, current.averageCPC) // Inverted - lower CPC is better
      },
      ctr: {
        current: current.averageCTR,
        previous: previous.averageCTR,
        change: calculatePercentageChange(current.averageCTR, previous.averageCTR),
        trend: getTrendDirection(current.averageCTR, previous.averageCTR)
      }
    };
  }, [dashboardData]);

  // Handle date range change
  const handleDateRangeChange = (newDateRange: DateRange) => {
    setDateRange(newDateRange);
    // Update user preferences
    updatePreferences({ defaultDateRange: newDateRange });
  };

  // Handle platform filter change
  const handlePlatformChange = (platforms: Platform[]) => {
    setSelectedPlatforms(platforms);
    updatePreferences({ selectedPlatforms: platforms });
  };

  // Handle manual refresh
  const handleRefresh = async () => {
    try {
      await Promise.all([
        refetchDashboard(),
        refetchInsights()
      ]);
      toast.success('Dashboard refreshed successfully');
    } catch (error) {
      toast.error('Failed to refresh dashboard');
    }
  };

  // Handle export
  const handleExport = async (format: 'csv' | 'json' = 'csv') => {
    try {
      setIsExporting(true);
      
      const response = await apiService.exportDashboardData({
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
        platforms: selectedPlatforms,
        format
      });

      // Create download link
      const blob = new Blob([response], { 
        type: format === 'csv' ? 'text/csv' : 'application/json' 
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `admetrics-dashboard-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Data exported successfully');
    } catch (error) {
      toast.error('Failed to export data');
    } finally {
      setIsExporting(false);
    }
  };

  // Auto-refresh when real-time data updates
  useEffect(() => {
    if (realTimeMetrics) {
      queryClient.setQueryData(
        ['dashboard', 'overview', dateRange, selectedPlatforms],
        (oldData: DashboardOverview | undefined) => {
          if (!oldData) return oldData;
          
          return {
            ...oldData,
            summary: {
              ...oldData.summary,
              current: {
                ...oldData.summary.current,
                ...realTimeMetrics
              }
            }
          };
        }
      );
    }
  }, [realTimeMetrics, queryClient, dateRange, selectedPlatforms]);

  if (isDashboardLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (dashboardError) {
    return (
      <ErrorAlert
        title="Failed to load dashboard"
        message="There was an error loading your dashboard data."
        onRetry={refetchDashboard}
      />
    );
  }

  return (
    <>
      <Helmet>
        <title>Dashboard - AdMetrics AI</title>
        <meta name="description" content="AdMetrics AI Dashboard - Monitor and optimize your advertising campaigns with AI-powered insights" />
      </Helmet>

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Monitor your advertising campaign performance
                </p>
              </div>

              <div className="flex items-center space-x-4">
                {/* Refresh Button */}
                <button
                  onClick={handleRefresh}
                  disabled={isDashboardFetching}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <ArrowPathIcon 
                    className={`h-4 w-4 mr-2 ${isDashboardFetching ? 'animate-spin' : ''}`} 
                  />
                  Refresh
                </button>

                {/* Export Button */}
                <button
                  onClick={() => handleExport('csv')}
                  disabled={isExporting}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <DocumentArrowDownIcon className="h-4 w-4 mr-2" />
                  {isExporting ? 'Exporting...' : 'Export'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center space-x-2">
                <CalendarIcon className="h-5 w-5 text-gray-500" />
                <DateRangePicker
                  startDate={dateRange.startDate}
                  endDate={dateRange.endDate}
                  onChange={handleDateRangeChange}
                />
              </div>

              <div className="flex items-center space-x-2">
                <FunnelIcon className="h-5 w-5 text-gray-500" />
                <PlatformFilter
                  selectedPlatforms={selectedPlatforms}
                  onChange={handlePlatformChange}
                />
              </div>

              {realTimeMetrics && (
                <div className="ml-auto flex items-center space-x-2 text-sm text-gray-500">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span>Live data</span>
                </div>
              )}
            </div>
          </div>

          {/* Alerts */}
          {dashboardData && dashboardData.alerts.total > 0 && (
            <div className="mb-6">
              <AlertsList 
                alerts={dashboardData.alerts.recent} 
                showAll={false}
              />
            </div>
          )}

          {/* Key Metrics */}
          {metrics && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <MetricCard
                title="Total Spend"
                value={formatCurrency(metrics.spend.current)}
                change={metrics.spend.change}
                trend={metrics.spend.trend}
                icon={CurrencyDollarIcon}
                color="blue"
              />
              
              <MetricCard
                title="Total Clicks"
                value={formatNumber(metrics.clicks.current)}
                change={metrics.clicks.change}
                trend={metrics.clicks.trend}
                icon={CursorArrowRaysIcon}
                color="green"
              />
              
              <MetricCard
                title="Conversions"
                value={formatNumber(metrics.conversions.current)}
                change={metrics.conversions.change}
                trend={metrics.conversions.trend}
                icon={ChartBarIcon}
                color="purple"
              />
              
              <MetricCard
                title="ROAS"
                value={`${metrics.roas.current.toFixed(2)}x`}
                change={metrics.roas.change}
                trend={metrics.roas.trend}
                icon={ArrowTrendingUpIcon}
                color="orange"
              />
            </div>
          )}

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Performance Chart */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Trends</h3>
              {dashboardData ? (
                <PerformanceChart 
                  data={dashboardData.performance.data}
                  loading={isDashboardFetching}
                />
              ) : (
                <div className="h-64 flex items-center justify-center">
                  <LoadingSpinner />
                </div>
              )}
            </div>

            {/* Platform Comparison */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Platform Performance</h3>
              {dashboardData ? (
                <PlatformComparison 
                  data={dashboardData.platforms}
                  loading={isDashboardFetching}
                />
              ) : (
                <div className="h-64 flex items-center justify-center">
                  <LoadingSpinner />
                </div>
              )}
            </div>
          </div>

          {/* Content Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top Campaigns */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Top Performing Campaigns</h3>
                  <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                    View All
                  </button>
                </div>
                {dashboardData ? (
                  <CampaignTable 
                    campaigns={dashboardData.topCampaigns}
                    loading={isDashboardFetching}
                    compact={true}
                  />
                ) : (
                  <div className="h-64 flex items-center justify-center">
                    <LoadingSpinner />
                  </div>
                )}
              </div>
            </div>

            {/* AI Insights */}
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <LightBulbIcon className="h-5 w-5 text-yellow-500" />
                    <h3 className="text-lg font-medium text-gray-900">AI Insights</h3>
                  </div>
                  <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                    View All
                  </button>
                </div>
                
                <div className="space-y-4">
                  {isInsightsLoading ? (
                    <div className="h-32 flex items-center justify-center">
                      <LoadingSpinner size="sm" />
                    </div>
                  ) : aiInsights?.insights?.length > 0 ? (
                    aiInsights.insights.slice(0, 3).map((insight: any) => (
                      <AIInsightCard 
                        key={insight.id} 
                        insight={insight}
                        compact={true}
                      />
                    ))
                  ) : (
                    <div className="text-center text-gray-500 py-8">
                      <LightBulbIcon className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm">No insights available</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Dashboard;