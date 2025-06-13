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
  DocumentArrowDownIcon,
  Cog6ToothIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

// Components
import MetricCard, { MetricCardsGrid, MetricCardSkeleton } from '../../components/dashboard/MetricCard';
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
import { useAuth } from '../../hooks/useAuth';
import { apiService } from '../../services/api.service';

// Types
import { DateRange, Platform } from '../../types/common.types';
import { DashboardOverview, MetricsData } from '../../types/dashboard.types';

// Utils
import { formatCurrency, formatNumber, formatPercentage } from '../../utils/formatters';
import { calculatePercentageChange, getTrendDirection } from '../../utils/calculations';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

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

  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([
    'spend', 'clicks', 'conversions', 'ctr'
  ]);

  const [isExporting, setIsExporting] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState<number>(300000); // 5 minutes
  const [showInsights, setShowInsights] = useState(true);

  // Real-time metrics
  const {
    metrics: realTimeMetrics,
    connectionStatus,
    getCampaignMetrics,
    getAggregatedMetrics,
    refresh: refreshRealTime,
    isConnected: isRealTimeConnected
  } = useRealTimeMetrics({
    enabled: true,
    platforms: selectedPlatforms,
    updateInterval: refreshInterval
  });

  // Query parameters
  const queryParams = useMemo(() => ({
    startDate: dateRange.startDate.toISOString(),
    endDate: dateRange.endDate.toISOString(),
    platforms: selectedPlatforms.join(',')
  }), [dateRange, selectedPlatforms]);

  // Fetch dashboard overview
  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
    refetch: refetchOverview
  } = useQuery({
    queryKey: ['dashboard-overview', queryParams],
    queryFn: () => apiService.getDashboardOverview(queryParams),
    refetchInterval: refreshInterval,
    staleTime: 30000, // 30 seconds
  });

  // Fetch performance chart data
  const {
    data: chartData,
    isLoading: chartLoading,
    error: chartError
  } = useQuery({
    queryKey: ['performance-chart', queryParams, selectedMetrics],
    queryFn: () => apiService.getPerformanceChart({
      ...queryParams,
      metrics: selectedMetrics.join(','),
      groupBy: 'day'
    }),
    enabled: selectedMetrics.length > 0,
    staleTime: 60000, // 1 minute
  });

  // Fetch platform comparison
  const {
    data: platformData,
    isLoading: platformLoading
  } = useQuery({
    queryKey: ['platform-comparison', queryParams],
    queryFn: () => apiService.getPlatformComparison({
      ...queryParams,
      metric: 'spend'
    }),
    staleTime: 120000, // 2 minutes
  });

  // Fetch top campaigns
  const {
    data: topCampaigns,
    isLoading: campaignsLoading
  } = useQuery({
    queryKey: ['top-campaigns', queryParams],
    queryFn: () => apiService.getTopCampaigns({
      ...queryParams,
      metric: 'roas',
      limit: 10
    }),
    staleTime: 120000, // 2 minutes
  });

  // Fetch AI insights
  const {
    data: aiInsights,
    isLoading: insightsLoading
  } = useQuery({
    queryKey: ['ai-insights', queryParams],
    queryFn: () => apiService.getAIInsights(queryParams),
    enabled: showInsights,
    staleTime: 300000, // 5 minutes
  });

  // Handle date range change
  const handleDateRangeChange = (newRange: DateRange) => {
    setDateRange(newRange);
    // Invalidate related queries
    queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
    queryClient.invalidateQueries({ queryKey: ['performance-chart'] });
    queryClient.invalidateQueries({ queryKey: ['platform-comparison'] });
  };

  // Handle platform filter change
  const handlePlatformChange = (platforms: Platform[]) => {
    setSelectedPlatforms(platforms);
  };

  // Handle metrics selection change
  const handleMetricsChange = (metrics: string[]) => {
    setSelectedMetrics(metrics);
  };

  // Handle manual refresh
  const handleRefresh = async () => {
    try {
      await Promise.all([
        refetchOverview(),
        refreshRealTime(),
        queryClient.invalidateQueries({ queryKey: ['performance-chart'] }),
        queryClient.invalidateQueries({ queryKey: ['platform-comparison'] }),
        queryClient.invalidateQueries({ queryKey: ['top-campaigns'] })
      ]);
      toast.success('Dashboard refreshed');
    } catch (error) {
      toast.error('Failed to refresh dashboard');
    }
  };

  // Handle export
  const handleExport = async () => {
    try {
      setIsExporting(true);
      await apiService.exportData('/dashboard/export', queryParams, 'dashboard-report.csv');
    } catch (error) {
      toast.error('Failed to export data');
    } finally {
      setIsExporting(false);
    }
  };

  // Auto-refresh effect
  useEffect(() => {
    const interval = setInterval(handleRefresh, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  // Error handling
  if (overviewError) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <ErrorAlert 
          title="Failed to load dashboard"
          message="There was an error loading your dashboard data. Please try again."
          onRetry={handleRefresh}
        />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Dashboard - AdMetrics AI</title>
        <meta name="description" content="AI-powered advertising analytics dashboard" />
      </Helmet>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Dashboard
                </h1>
                
                {/* Real-time status indicator */}
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${
                    isRealTimeConnected ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {isRealTimeConnected ? 'Live' : 'Disconnected'}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                {/* Date Range Picker */}
                <DateRangePicker
                  startDate={dateRange.startDate}
                  endDate={dateRange.endDate}
                  onChange={handleDateRangeChange}
                />

                {/* Platform Filter */}
                <PlatformFilter
                  selectedPlatforms={selectedPlatforms}
                  onChange={handlePlatformChange}
                />

                {/* Action buttons */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleRefresh}
                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                    title="Refresh"
                  >
                    <ArrowPathIcon className="h-5 w-5" />
                  </button>

                  <button
                    onClick={handleExport}
                    disabled={isExporting}
                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                    title="Export"
                  >
                    {isExporting ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <DocumentArrowDownIcon className="h-5 w-5" />
                    )}
                  </button>

                  <button
                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                    title="Settings"
                  >
                    <Cog6ToothIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Overview Metrics */}
          <section className="mb-8">
            <div className="mb-6">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Performance Overview
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Key metrics from {dateRange.startDate.toLocaleDateString()} to {dateRange.endDate.toLocaleDateString()}
              </p>
            </div>

            {overviewLoading ? (
              <MetricCardsGrid columns={4}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <MetricCardSkeleton key={i} />
                ))}
              </MetricCardsGrid>
            ) : (
              <MetricCardsGrid columns={4}>
                <MetricCard
                  title="Total Spend"
                  value={overview?.summary?.totalSpend || 0}
                  previousValue={overview?.summary?.trends?.spendTrend}
                  format="currency"
                  icon={<CurrencyDollarIcon className="h-6 w-6" />}
                  color="blue"
                />
                
                <MetricCard
                  title="Total Clicks"
                  value={overview?.summary?.totalClicks || 0}
                  previousValue={overview?.summary?.trends?.clicksTrend}
                  format="number"
                  icon={<CursorArrowRaysIcon className="h-6 w-6" />}
                  color="green"
                />
                
                <MetricCard
                  title="Conversions"
                  value={overview?.summary?.totalConversions || 0}
                  previousValue={overview?.summary?.trends?.conversionsTrend}
                  format="number"
                  icon={<ArrowTrendingUpIcon className="h-6 w-6" />}
                  color="purple"
                />
                
                <MetricCard
                  title="ROAS"
                  value={overview?.summary?.averageROAS || 0}
                  previousValue={overview?.summary?.trends?.roasTrend}
                  format="number"
                  icon={<ChartBarIcon className="h-6 w-6" />}
                  color="indigo"
                  description="Return on Ad Spend"
                />
              </MetricCardsGrid>
            )}
          </section>

          {/* Charts Section */}
          <section className="mb-8">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Performance Chart */}
              <div className="xl:col-span-2">
                <PerformanceChart
                  data={chartData?.chartData || []}
                  metrics={selectedMetrics}
                  title="Performance Trends"
                  loading={chartLoading}
                  height={400}
                  showBrush={true}
                  timeRange="day"
                />
              </div>

              {/* Platform Comparison */}
              <div>
                <PlatformComparison
                  data={platformData?.comparison || []}
                  metric="spend"
                  title="Platform Performance"
                  loading={platformLoading}
                  height={400}
                />
              </div>
            </div>
          </section>

          {/* AI Insights & Alerts */}
          {showInsights && (
            <section className="mb-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* AI Insights */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                      AI Insights
                    </h3>
                    <LightBulbIcon className="h-5 w-5 text-yellow-500" />
                  </div>
                  
                  {insightsLoading ? (
                    <div className="space-y-4">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {aiInsights?.slice(0, 3).map((insight: any, index: number) => (
                        <AIInsightCard
                          key={insight.id || index}
                          insight={insight}
                          onDismiss={() => {
                            // Handle insight dismissal
                          }}
                          onApply={() => {
                            // Handle insight application
                          }}
                        />
                      ))}
                      
                      {!aiInsights?.length && (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                          <LightBulbIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p>No insights available yet</p>
                          <p className="text-sm">Check back once you have more data</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Recent Alerts */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                      Recent Alerts
                    </h3>
                    <ExclamationTriangleIcon className="h-5 w-5 text-orange-500" />
                  </div>
                  
                  <AlertsList
                    alerts={overview?.alerts || []}
                    maxItems={5}
                    showActions={true}
                  />
                </div>
              </div>
            </section>
          )}

          {/* Top Campaigns Table */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Top Performing Campaigns
              </h3>
              <button className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                <PlusIcon className="h-4 w-4" />
                <span>New Campaign</span>
              </button>
            </div>

            <CampaignTable
              campaigns={topCampaigns?.campaigns || []}
              loading={campaignsLoading}
              onCampaignClick={(campaign) => {
                // Navigate to campaign details
              }}
              showActions={true}
              sortBy="roas"
              sortOrder="desc"
            />
          </section>
        </div>
      </div>
    </>
  );
};

export default Dashboard;