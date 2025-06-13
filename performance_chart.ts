import React, { useMemo, useState } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ReferenceLine,
  Brush
} from 'recharts';
import { motion } from 'framer-motion';
import {
  EyeIcon,
  CalendarIcon,
  ChartBarIcon,
  ArrowsPointingOutIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency, formatNumber, formatPercentage } from '../../utils/formatters';
import clsx from 'clsx';

interface DataPoint {
  date: string;
  timestamp: number;
  spend?: number;
  clicks?: number;
  impressions?: number;
  conversions?: number;
  ctr?: number;
  cpc?: number;
  roas?: number;
  cpl?: number;
}

interface MetricConfig {
  key: string;
  label: string;
  color: string;
  format: 'currency' | 'number' | 'percentage';
  yAxisId?: 'left' | 'right';
  strokeWidth?: number;
  strokeDasharray?: string;
}

interface PerformanceChartProps {
  data: DataPoint[];
  metrics: string[];
  title?: string;
  height?: number;
  loading?: boolean;
  showBrush?: boolean;
  showLegend?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
  timeRange?: 'day' | 'week' | 'month';
  onDataPointClick?: (data: DataPoint) => void;
  className?: string;
}

const PerformanceChart: React.FC<PerformanceChartProps> = ({
  data,
  metrics,
  title = 'Performance Overview',
  height = 400,
  loading = false,
  showBrush = true,
  showLegend = true,
  showGrid = true,
  showTooltip = true,
  timeRange = 'day',
  onDataPointClick,
  className,
}) => {
  const [activeMetrics, setActiveMetrics] = useState<string[]>(metrics);
  const [focusedLine, setFocusedLine] = useState<string | null>(null);

  // Metric configurations
  const metricConfigs: Record<string, MetricConfig> = {
    spend: {
      key: 'spend',
      label: 'Spend',
      color: '#3B82F6',
      format: 'currency',
      yAxisId: 'left',
      strokeWidth: 3,
    },
    clicks: {
      key: 'clicks',
      label: 'Clicks',
      color: '#10B981',
      format: 'number',
      yAxisId: 'right',
      strokeWidth: 2,
    },
    impressions: {
      key: 'impressions',
      label: 'Impressions',
      color: '#8B5CF6',
      format: 'number',
      yAxisId: 'right',
      strokeWidth: 2,
      strokeDasharray: '5 5',
    },
    conversions: {
      key: 'conversions',
      label: 'Conversions',
      color: '#F59E0B',
      format: 'number',
      yAxisId: 'right',
      strokeWidth: 3,
    },
    ctr: {
      key: 'ctr',
      label: 'CTR',
      color: '#EF4444',
      format: 'percentage',
      yAxisId: 'right',
      strokeWidth: 2,
    },
    cpc: {
      key: 'cpc',
      label: 'CPC',
      color: '#6366F1',
      format: 'currency',
      yAxisId: 'left',
      strokeWidth: 2,
    },
    roas: {
      key: 'roas',
      label: 'ROAS',
      color: '#EC4899',
      format: 'number',
      yAxisId: 'right',
      strokeWidth: 3,
    },
    cpl: {
      key: 'cpl',
      label: 'CPL',
      color: '#14B8A6',
      format: 'currency',
      yAxisId: 'left',
      strokeWidth: 2,
    },
  };

  // Process data for chart
  const chartData = useMemo(() => {
    return data.map(point => ({
      ...point,
      formattedDate: formatDateForDisplay(point.date, timeRange),
    }));
  }, [data, timeRange]);

  // Get active metric configs
  const activeMetricConfigs = useMemo(() => {
    return activeMetrics
      .filter(metric => metricConfigs[metric])
      .map(metric => metricConfigs[metric]);
  }, [activeMetrics]);

  // Check if we need dual y-axis
  const needsDualAxis = useMemo(() => {
    const leftAxisMetrics = activeMetricConfigs.filter(config => config.yAxisId === 'left');
    const rightAxisMetrics = activeMetricConfigs.filter(config => config.yAxisId === 'right');
    return leftAxisMetrics.length > 0 && rightAxisMetrics.length > 0;
  }, [activeMetricConfigs]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4">
        <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
          {label}
        </p>
        {payload.map((entry: any, index: number) => {
          const config = metricConfigs[entry.dataKey];
          if (!config) return null;
          
          return (
            <div key={index} className="flex items-center justify-between space-x-4">
              <div className="flex items-center space-x-2">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  {config.label}:
                </span>
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {formatValue(entry.value, config.format)}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  // Custom legend
  const CustomLegend = ({ payload }: any) => {
    return (
      <div className="flex flex-wrap justify-center gap-4 mt-4">
        {payload.map((entry: any, index: number) => (
          <button
            key={index}
            className={clsx(
              'flex items-center space-x-2 px-3 py-1 rounded-full text-sm transition-all',
              activeMetrics.includes(entry.dataKey)
                ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
            )}
            onClick={() => toggleMetric(entry.dataKey)}
          >
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span>{entry.value}</span>
          </button>
        ))}
      </div>
    );
  };

  const toggleMetric = (metric: string) => {
    setActiveMetrics(prev => 
      prev.includes(metric)
        ? prev.filter(m => m !== metric)
        : [...prev, metric]
    );
  };

  const formatValue = (value: number, format: string) => {
    switch (format) {
      case 'currency':
        return formatCurrency(value);
      case 'percentage':
        return formatPercentage(value);
      case 'number':
      default:
        return formatNumber(value);
    }
  };

  const formatDateForDisplay = (date: string, range: string) => {
    const d = new Date(date);
    switch (range) {
      case 'day':
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      case 'week':
        return `Week ${Math.ceil(d.getDate() / 7)}`;
      case 'month':
        return d.toLocaleDateString('en-US', { month: 'short' });
      default:
        return d.toLocaleDateString();
    }
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
          <ChartBarIcon className="h-16 w-16 mb-4" />
          <p className="text-lg font-medium">No data available</p>
          <p className="text-sm">Try adjusting your filters or date range</p>
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
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          {title}
        </h3>
        
        <div className="flex items-center space-x-2">
          <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <EyeIcon className="h-5 w-5" />
          </button>
          <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <ArrowsPointingOutIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <LineChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            onClick={onDataPointClick}
          >
            {showGrid && (
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke="#E5E7EB"
                className="dark:stroke-gray-600"
              />
            )}
            
            <XAxis 
              dataKey="formattedDate"
              stroke="#6B7280"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            
            <YAxis
              yAxisId="left"
              stroke="#6B7280"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => formatNumber(value)}
            />
            
            {needsDualAxis && (
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#6B7280"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => formatNumber(value)}
              />
            )}
            
            {showTooltip && <Tooltip content={<CustomTooltip />} />}
            
            {showLegend && (
              <Legend content={<CustomLegend />} />
            )}

            {activeMetricConfigs.map((config) => (
              <Line
                key={config.key}
                type="monotone"
                dataKey={config.key}
                stroke={config.color}
                strokeWidth={
                  focusedLine && focusedLine !== config.key ? 1 : config.strokeWidth
                }
                strokeDasharray={config.strokeDasharray}
                yAxisId={config.yAxisId || 'left'}
                dot={{ fill: config.color, strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: config.color, strokeWidth: 2 }}
                opacity={
                  focusedLine && focusedLine !== config.key ? 0.3 : 1
                }
                onMouseEnter={() => setFocusedLine(config.key)}
                onMouseLeave={() => setFocusedLine(null)}
              />
            ))}

            {showBrush && data.length > 10 && (
              <Brush
                dataKey="formattedDate"
                height={30}
                stroke="#8B5CF6"
                fill="#EDE9FE"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Chart statistics */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        {activeMetricConfigs.slice(0, 4).map((config) => {
          const values = chartData.map(d => d[config.key as keyof DataPoint] as number || 0);
          const total = values.reduce((sum, val) => sum + val, 0);
          const average = total / values.length;
          const max = Math.max(...values);
          
          return (
            <div key={config.key} className="text-center">
              <div 
                className="w-3 h-3 rounded-full mx-auto mb-1"
                style={{ backgroundColor: config.color }}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {config.label} Avg
              </p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {formatValue(average, config.format)}
              </p>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default PerformanceChart;