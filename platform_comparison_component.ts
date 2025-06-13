import React, { useMemo, useState } from 'react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';
import { motion } from 'framer-motion';
import {
  ChartBarIcon,
  ChartPieIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency, formatNumber, formatPercentage } from '../../utils/formatters';
import clsx from 'clsx';

interface PlatformData {
  platform: string;
  value: number;
  percentage: number;
  change?: number;
  color?: string;
}

interface PlatformComparisonProps {
  data: PlatformData[];
  metric: string;
  title?: string;
  height?: number;
  loading?: boolean;
  chartType?: 'pie' | 'bar';
  showLegend?: boolean;
  showTooltip?: boolean;
  className?: string;
}

const PlatformComparison: React.FC<PlatformComparisonProps> = ({
  data,
  metric,
  title = 'Platform Comparison',
  height = 400,
  loading = false,
  chartType = 'pie',
  showLegend = true,
  showTooltip = true,
  className,
}) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [currentChartType, setCurrentChartType] = useState<'pie' | 'bar'>(chartType);

  // Default colors for platforms
  const defaultColors = [
    '#3B82F6', // Blue - Google
    '#1877F2', // Facebook Blue
    '#E1306C', // Instagram Pink
    '#FF0050', // TikTok Red
    '#0A66C2', // LinkedIn Blue
    '#1DA1F2', // Twitter Blue
    '#BD081C', // Pinterest Red
    '#FFFC00', // Snapchat Yellow
  ];

  // Platform icons/names mapping
  const platformInfo: Record<string, { name: string; icon: string; color: string }> = {
    GOOGLE_ADS: { name: 'Google Ads', icon: '🔍', color: '#4285F4' },
    FACEBOOK_ADS: { name: 'Facebook', icon: '👍', color: '#1877F2' },
    INSTAGRAM_ADS: { name: 'Instagram', icon: '📷', color: '#E4405F' },
    TIKTOK_ADS: { name: 'TikTok', icon: '🎵', color: '#000000' },
    LINKEDIN_ADS: { name: 'LinkedIn', icon: '💼', color: '#0A66C2' },
    TWITTER_ADS: { name: 'Twitter', icon: '🐦', color: '#1DA1F2' },
    PINTEREST_ADS: { name: 'Pinterest', icon: '📌', color: '#BD081C' },
    SNAPCHAT_ADS: { name: 'Snapchat', icon: '👻', color: '#FFFC00' },
  };

  // Process data for charts
  const processedData = useMemo(() => {
    return data.map((item, index) => {
      const platformKey = item.platform.toUpperCase();
      const info = platformInfo[platformKey] || { 
        name: item.platform, 
        icon: '📊', 
        color: defaultColors[index % defaultColors.length] 
      };
      
      return {
        ...item,
        name: info.name,
        icon: info.icon,
        fill: item.color || info.color,
        displayValue: formatValue(item.value, metric),
      };
    });
  }, [data, metric]);

  // Format value based on metric type
  const formatValue = (value: number, metricType: string) => {
    switch (metricType.toLowerCase()) {
      case 'spend':
      case 'revenue':
      case 'cpc':
      case 'cpa':
      case 'cpl':
        return formatCurrency(value);
      case 'ctr':
      case 'conversion_rate':
      case 'percentage':
        return formatPercentage(value);
      default:
        return formatNumber(value);
    }
  };

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload;
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4">
        <div className="flex items-center space-x-2 mb-2">
          <span className="text-lg">{data.icon}</span>
          <p className="font-medium text-gray-900 dark:text-white">
            {data.name}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {metric}: <span className="font-medium">{data.displayValue}</span>
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Share: <span className="font-medium">{data.percentage.toFixed(1)}%</span>
          </p>
          {data.change !== undefined && (
            <div className="flex items-center space-x-1">
              {data.change > 0 ? (
                <ArrowTrendingUpIcon className="h-3 w-3 text-green-500" />
              ) : (
                <ArrowTrendingDownIcon className="h-3 w-3 text-red-500" />
              )}
              <span className={clsx(
                'text-xs font-medium',
                data.change > 0 ? 'text-green-600' : 'text-red-600'
              )}>
                {Math.abs(data.change).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Handle pie chart hover
  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };

  const onPieLeave = () => {
    setActiveIndex(null);
  };

  if (loading) {
    return (
      <div className={clsx('bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6', className)}>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-4"></div>
          <div className="h-80 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={clsx('bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6', className)}>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          {title}
        </h3>
        <div className="flex flex-col items-center justify-center h-80 text-gray-500 dark:text-gray-400">
          <ChartPieIcon className="h-16 w-16 mb-4" />
          <p className="text-lg font-medium">No platform data available</p>
          <p className="text-sm">Connect your advertising platforms to see comparisons</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={clsx('bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6', className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          {title}
        </h3>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setCurrentChartType('pie')}
            className={clsx(
              'p-2 rounded-lg transition-colors',
              currentChartType === 'pie'
                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            )}
            title="Pie Chart"
          >
            <ChartPieIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => setCurrentChartType('bar')}
            className={clsx(
              'p-2 rounded-lg transition-colors',
              currentChartType === 'bar'
                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            )}
            title="Bar Chart"
          >
            <ChartBarIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Chart */}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          {currentChartType === 'pie' ? (
            <PieChart>
              <Pie
                data={processedData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={120}
                paddingAngle={2}
                dataKey="value"
                onMouseEnter={onPieEnter}
                onMouseLeave={onPieLeave}
              >
                {processedData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.fill}
                    stroke={activeIndex === index ? '#374151' : 'none'}
                    strokeWidth={activeIndex === index ? 2 : 0}
                  />
                ))}
              </Pie>
              {showTooltip && <Tooltip content={<CustomTooltip />} />}
              {showLegend && (
                <Legend 
                  formatter={(value, entry: any) => (
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {entry.payload.icon} {value}
                    </span>
                  )}
                  wrapperStyle={{ paddingTop: '20px' }}
                />
              )}
            </PieChart>
          ) : (
            <BarChart data={processedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" className="dark:stroke-gray-600" />
              <XAxis 
                dataKey="name" 
                stroke="#6B7280"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                stroke="#6B7280"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => formatValue(value, metric)}
              />
              {showTooltip && <Tooltip content={<CustomTooltip />} />}
              {showLegend && <Legend />}
              <Bar 
                dataKey="value" 
                radius={[4, 4, 0, 0]}
                fill="#3B82F6"
              >
                {processedData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Summary Statistics */}
      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {processedData.slice(0, 4).map((platform, index) => (
            <div key={platform.platform} className="text-center">
              <div className="flex items-center justify-center space-x-2 mb-1">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: platform.fill }}
                />
                <span className="text-lg">{platform.icon}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {platform.name}
              </p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {platform.displayValue}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {platform.percentage.toFixed(1)}%
              </p>
            </div>
          ))}
        </div>
        
        {processedData.length > 4 && (
          <div className="mt-4 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              +{processedData.length - 4} more platforms
            </p>
          </div>
        )}
      </div>

      {/* Performance Insights */}
      {processedData.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Top Performer
              </p>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-lg">{processedData[0].icon}</span>
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  {processedData[0].name} - {processedData[0].displayValue}
                </span>
              </div>
            </div>
            
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Market Share
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                {processedData[0].percentage.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default PlatformComparison;