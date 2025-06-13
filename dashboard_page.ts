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
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: refreshInterval,
    retry: 2,
  });

  // Fetch metrics data for charts
  const {
    data: metricsData,
    isLoading: metricsLoading,
    error: metricsError
  } = useQuery({
    queryKey: ['dashboard-metrics', queryParams, selectedMetrics],
    queryFn: () => apiService.getDashboardMetrics({
      ...queryParams,
      metrics: selectedMetrics.join(','),
      includeComparison: true
    }),
    staleTime: 5 * 60 * 1000,
    refetchInterval: refreshInterval,
    enabled: !!overview, // Only fetch after overview is loaded
  });

  // Fetch AI insights
  const {
    data: aiInsights,
    isLoading: insightsLoading
  } = useQuery({
    queryKey: ['ai-insights', dateRange],
    queryFn: () => apiService.getAIInsights({
      startDate: dateRange.startDate.toISOString(),
      endDate: dateRange.endDate.toISOString(),
      platforms: selectedPlatforms.join(',')
    }),
    staleTime: 15 * 60 * 1000, // 15 minutes
    enabled: showInsights,
  });

  // Handle date range change
  const handleDateRangeChange = (newDateRange: DateRange) => {
    setDateRange(newDateRange);
    // Invalidate queries to refetch with new date range
    queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
  };

  // Handle platform filter change
  const handlePlatformChange = (platforms: Platform[]) => {
    setSelectedPlatforms(platforms);
    queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
  };

  // Handle manual refresh
  const handleRefresh = async () => {
    try {
      await Promise.all([
        refetchOverview(),
        refreshRealTime(),
        queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
      ]);
      toast.success('Dashboard refreshed successfully');
    } catch (error) {
      toast.error('Failed to refresh dashboard');
    }
  };

  // Handle export
  const handleExport = async (format: 'pdf' | 'excel' | 'csv') => {
    setIsExporting(true);
    try {
      const blob = await apiService.exportDashboard({
        format,
        ...queryParams,
        includeCharts: format === 'pdf',
        includeInsights: showInsights
      });

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dashboard-${dateRange.startDate.toISOString().split('T')[0]}-to-${dateRange.endDate.toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(`Dashboard exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error('Failed to export dashboard');
    } finally {
      setIsExporting(false);
    }
  };

  // Loading state
  if (overviewLoading && !overview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (overviewError && !overview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <ErrorAlert
          title="Failed to load dashboard"
          message="There was an error loading your dashboard data. Please try refreshing the page."
          onRetry={handleRefresh}
        />
      </div>
    );
  }

  // Merge real-time data with overview data
  const currentMetrics = realTimeMetrics || overview?.summary?.current;

  return (
    <>
      <Helmet>
        <title>Dashboard - AdMetrics AI</title>
        <meta name="description" content="AI-powered advertising analytics dashboard" />
      </Helmet>

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                {isRealTimeConnected && (
                  <div className="flex items-center space-x-2 text-sm text-green-600">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span>Live</span>
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-4">
                {/* Date Range Picker */}
                <DateRangePicker
                  startDate={dateRange.startDate}
                  endDate={dateRange.endDate}
                  onChange={handleDateRangeChange}
                  maxDate={new Date()}
                  presets={[
                    { label: 'Last 7 days', value: 7 },
                    { label: 'Last 30 days', value: 30 },
                    { label: 'Last 90 days', value: 90 },
                  ]}
                />

                {/* Platform Filter */}
                <PlatformFilter
                  selectedPlatforms={selectedPlatforms}
                  onChange={handlePlatformChange}
                />

                {/* Actions */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleRefresh}
                    disabled={overviewLoading}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                    title="Refresh dashboard"
                  >
                    <ArrowPathIcon className={`h-5 w-5 ${overviewLoading ? 'animate-spin' : ''}`} />
                  </button>

                  <div className="relative">
                    <select
                      value=""
                      onChange={(e) => e.target.value && handleExport(e.target.value as any)}
                      disabled={isExporting}
                      className="appearance-none bg-white border border-gray-300 rounded-md px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Export...</option>
                      <option value="pdf">Export as PDF</option>
                      <option value="excel">Export as Excel</option>
                      <option value="csv">Export as CSV</option>
                    </select>
                    <DocumentArrowDownIcon className="h-4 w-4 absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>

                  <button
                    onClick={() => setShowInsights(!showInsights)}
                    className={`p-2 rounded-md transition-colors ${
                      showInsights 
                        ? 'text-blue-600 bg-blue-50 hover:bg-blue-100' 
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                    title="Toggle AI insights"
                  >
                    <LightBulbIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <MetricCard
              title="Total Spend"
              value={formatCurrency(currentMetrics?.spend || 0)}
              change={overview?.summary?.change?.spend}
              icon={CurrencyDollarIcon}
              trend={getTrendDirection(overview?.summary?.change?.spend || 0)}
              loading={overviewLoading}
            />
            
            <MetricCard
              title="Total Clicks"
              value={formatNumber(currentMetrics?.clicks || 0)}
              change={overview?.summary?.change?.clicks}
              icon={CursorArrowRaysIcon}
              trend={getTrendDirection(overview?.summary?.change?.clicks || 0)}
              loading={overviewLoading}
            />
            
            <MetricCard
              title="Conversions"
              value={formatNumber(currentMetrics?.conversions || 0)}
              change={overview?.summary?.change?.conversions}
              icon={ChartBarIcon}
              trend={getTrendDirection(overview?.summary?.change?.conversions || 0)}
              loading={overviewLoading}
            />
            
            <MetricCard
              title="ROAS"
              value={`${formatNumber(currentMetrics?.roas || 0, 2)}x`}
              change={overview?.summary?.change?.roas}
              icon={ArrowTrendingUpIcon}
              trend={getTrendDirection(overview?.summary?.change?.roas || 0)}
              loading={overviewLoading}
            />
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Performance Chart */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Performance Trends</h3>
                <div className="flex items-center space-x-2">
                  <select
                    value={selectedMetrics[0] || 'spend'}
                    onChange={(e) => setSelectedMetrics([e.target.value, ...selectedMetrics.slice(1)])}
                    className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="spend">Spend</option>
                    <option value="clicks">Clicks</option>
                    <option value="conversions">Conversions</option>
                    <option value="roas">ROAS</option>
                  </select>
                </div>
              </div>
              
              <PerformanceChart
                data={metricsData?.current}
                comparisonData={metricsData?.comparison}
                loading={metricsLoading}
                selectedMetric={selectedMetrics[0] || 'spend'}
                height={300}
              />
            </div>

            {/* Platform Comparison */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Platform Performance</h3>
              
              <PlatformComparison
                data={overview?.platforms}
                loading={overviewLoading}
                metric="roas"
                height={300}
              />
            </div>
          </div>

          {/* AI Insights and Alerts */}
          {showInsights && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
              {/* AI Insights */}
              <div className="lg:col-span-2">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Insights</h3>
                <div className="space-y-4">
                  <AnimatePresence>
                    {aiInsights?.map((insight, index) => (
                      <motion.div
                        key={insight.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <AIInsightCard
                          insight={insight}
                          onAccept={(id) => {
                            // Handle insight acceptance
                            toast.success('Insight marked as useful');
                          }}
                          onDismiss={(id) => {
                            // Handle insight dismissal
                            toast.success('Insight dismissed');
                          }}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  
                  {insightsLoading && (
                    <div className="flex items-center justify-center py-8">
                      <LoadingSpinner size="md" />
                    </div>
                  )}
                  
                  {!insightsLoading && (!aiInsights || aiInsights.length === 0) && (
                    <div className="text-center py-8 text-gray-500">
                      <LightBulbIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p>No insights available for the selected period.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Alerts */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Alerts</h3>
                <AlertsList
                  alerts={overview?.alerts?.recent || []}
                  loading={overviewLoading}
                  onMarkAsRead={(alertId) => {
                    // Handle mark as read
                    toast.success('Alert marked as read');
                  }}
                  onDismiss={(alertId) => {
                    // Handle dismiss
                    toast.success('Alert dismissed');
                  }}
                />
              </div>
            </div>
          )}

          {/* Top Campaigns Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Top Performing Campaigns</h3>
                <button
                  onClick={() => {
                    // Navigate to campaigns page
                    window.location.href = '/campaigns';
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  View all campaigns →
                </button>
              </div>
            </div>
            
            <CampaignTable
              campaigns={overview?.topCampaigns || []}
              loading={overviewLoading}
              showPagination={false}
              maxRows={5}
              onCampaignClick={(campaign) => {
                // Navigate to campaign detail
                window.location.href = `/campaigns/${campaign.id}`;
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default Dashboard;