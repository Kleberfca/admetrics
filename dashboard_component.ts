import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ChartBarIcon,
  CurrencyDollarIcon,
  EyeIcon,
  CursorArrowRaysIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ExclamationTriangleIcon,
  LightBulbIcon
} from '@heroicons/react/24/outline';
import { Helmet } from 'react-helmet-async';

// Components
import MetricCard from '../components/metrics/MetricCard';
import PerformanceChart from '../components/charts/PerformanceChart';
import PlatformComparison from '../components/charts/PlatformComparison';
import CampaignTable from '../components/campaigns/CampaignTable';
import AIInsightCard from '../components/ai/AIInsightCard';
import DateRangePicker from '../components/common/DateRangePicker';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorAlert from '../components/common/ErrorAlert';

// Hooks and Services
import { useDashboardData } from '../hooks/useDashboardData';
import { useRealTimeMetrics } from '../hooks/useRealTimeMetrics';
import { apiService } from '../services/api.service';

// Types
import { DateRange, DashboardMetrics, AIInsight } from '../types/dashboard.types';

// Utils
import { formatCurrency, formatNumber, formatPercentage } from '../utils/formatters';
import { calculatePercentageChange } from '../utils/calculations';

const Dashboard: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
    endDate: new Date()
  });

  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    'GOOGLE_ADS',
    'FACEBOOK_ADS',
    'INSTAGRAM_ADS'
  ]);

  // Fetch dashboard data
  const {
    data: dashboardData,
    isLoading: isDashboardLoading,
    error: dashboardError,
    refetch: refetchDashboard
  } = useQuery({
    queryKey: ['dashboard', dateRange, selectedPlatforms],
    queryFn: () => apiService.getDashboardData(dateRange, selectedPlatforms),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000 // Auto-refresh every 10 minutes
  });

  // Fetch AI insights
  const {
    data: aiInsights,
    isLoading: isInsightsLoading
  } = useQuery({
    queryKey: ['ai-insights', dateRange],
    queryFn: () => apiService.getAIInsights(dateRange),
    staleTime: 15 * 60 * 1000 // 15 minutes
  });

  // Real-time metrics updates
  const realTimeMetrics = useRealTimeMetrics({
    enabled: true,
    platforms: selectedPlatforms
  });

  // Merge real-time data with dashboard data
  const metrics = realTimeMetrics || dashboardData?.metrics;

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
        message="There was an error loading your dashboard data. Please try again."
        onRetry={refetchDashboard}
      />
    );
  }

  const previousPeriodMetrics = dashboardData?.previousPeriodMetrics;

  // Calculate percentage changes
  const spendChange = calculatePercentageChange(
    metrics?.totalSpend,
    previousPeriodMetrics?.totalSpend
  );
  const clicksChange = calculatePercentageChange(
    metrics?.totalClicks,
    previousPeriodMetrics?.totalClicks
  );
  const conversionsChange = calculatePercentageChange(
    metrics?.totalConversions,
    previousPeriodMetrics?.totalConversions
  );
  const roasChange = calculatePercentageChange(
    metrics?.averageROAS,
    previousPeriodMetrics?.averageROAS
  );

  return (
    <>
      <Helmet>
        <title>Dashboard - AdMetrics AI</title>
        <meta name="description" content="AI-powered advertising campaign analytics dashboard" />
      </Helmet>

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-6 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-sm text-gray-600 mt-1">
                  Monitor and optimize your advertising campaigns with AI insights
                </p>
              </div>
              
              <div className="mt-4 sm:mt-0 flex items-center space-x-4">
                <DateRangePicker
                  value={dateRange}
                  onChange={setDateRange}
                  maxDate={new Date()}
                />
                
                <button
                  onClick={() => refetchDashboard()}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <ArrowTrendingUpIcon className="h-4 w-4 mr-2" />
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <MetricCard
                title="Total Spend"
                value={formatCurrency(metrics?.totalSpend || 0)}
                change={spendChange}
                changeType={spendChange >= 0 ? 'increase' : 'decrease'}
                icon={CurrencyDollarIcon}
                color="blue"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <MetricCard
                title="Total Clicks"
                value={formatNumber(metrics?.totalClicks || 0)}
                change={clicksChange}
                changeType={clicksChange >= 0 ? 'increase' : 'decrease'}
                icon={CursorArrowRaysIcon}
                color="green"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <MetricCard
                title="Conversions"
                value={formatNumber(metrics?.totalConversions || 0)}
                change={conversionsChange}
                changeType={conversionsChange >= 0 ? 'increase' : 'decrease'}
                icon={ChartBarIcon}
                color="purple"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <MetricCard
                title="Average ROAS"
                value={`${formatNumber(metrics?.averageROAS || 0)}x`}
                change={roasChange}
                changeType={roasChange >= 0 ? 'increase' : 'decrease'}
                icon={ArrowTrendingUpIcon}
                color="yellow"
              />
            </motion.div>
          </div>

          {/* AI Insights Section */}
          {aiInsights && aiInsights.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mb-8"
            >
              <div className="flex items-center mb-4">
                <LightBulbIcon className="h-6 w-6 text-yellow-500 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900">AI Insights</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {aiInsights.slice(0, 3).map((insight: AIInsight, index: number) => (
                  <AIInsightCard
                    key={insight.id}
                    insight={insight}
                    onApply={() => {/* Handle apply */}}
                    onDismiss={() => {/* Handle dismiss */}}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 }}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
            >
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Performance Trend
              </h3>
              <PerformanceChart
                data={dashboardData?.performanceData || []}
                metrics={['spend', 'clicks', 'conversions']}
                dateRange={dateRange}
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.7 }}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
            >
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Platform Comparison
              </h3>
              <PlatformComparison
                data={dashboardData?.platformData || []}
                metric="roas"
              />
            </motion.div>
          </div>

          {/* Campaign Performance Table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="bg-white rounded-lg shadow-sm border border-gray-200"
          >
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">
                  Top Campaigns
                </h3>
                <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                  View All Campaigns
                </button>
              </div>
            </div>
            
            <CampaignTable
              campaigns={dashboardData?.topCampaigns || []}
              isLoading={isDashboardLoading}
              showActions={false}
              maxRows={10}
            />
          </motion.div>

          {/* Real-time Updates Indicator */}
          {realTimeMetrics && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="fixed bottom-4 right-4"
            >
              <div className="bg-green-500 text-white px-3 py-2 rounded-lg shadow-lg flex items-center space-x-2">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                <span className="text-sm font-medium">Live Data</span>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </>
  );
};

export default Dashboard;