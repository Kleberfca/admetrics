// frontend/src/components/charts/PerformanceChart.tsx
import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ReferenceLine
} from 'recharts';
import { motion } from 'framer-motion';
import {
  ChartBarIcon,
  ChartLineIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  EyeIcon,
  EyeSlashIcon
} from '@heroicons/react/24/outline';
import { formatCurrency, formatNumber, formatPercentage } from '../../utils/formatters';

interface ChartDataPoint {
  date: string;
  spend?: number;
  clicks?: number;
  impressions?: number;
  conversions?: number;
  ctr?: number;
  cpc?: number;
  roas?: number;
  revenue?: number;
}

interface PerformanceChartProps {
  data: ChartDataPoint[];
  loading?: boolean;
  height?: number;
  showLegend?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
  chartType?: 'line' | 'area' | 'bar';
  metrics?: string[];
  colors?: string[];
  className?: string;
  onDataPointClick?: (data: ChartDataPoint) => void;
}

const defaultMetrics = ['spend', 'clicks', 'conversions'];
const defaultColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#F97316'];

const metricConfig = {
  spend: {
    label: 'Spend',
    color: '#3B82F6',
    yAxisId: 'currency',
    formatter: (value: number) => formatCurrency(value),
    strokeWidth: 2
  },
  clicks: {
    label: 'Clicks',
    color: '#10B981',
    yAxisId: 'count',
    formatter: (value: number) => formatNumber(value),
    strokeWidth: 2
  },
  impressions: {
    label: 'Impressions',
    color: '#F59E0B',
    yAxisId: 'count',
    formatter: (value: number) => formatNumber(value),
    strokeWidth: 2
  },
  conversions: {
    label: 'Conversions',
    color: '#EF4444',
    yAxisId: 'count',
    formatter: (value: number) => formatNumber(value),
    strokeWidth: 2
  },
  ctr: {
    label: 'CTR',
    color: '#8B5CF6',
    yAxisId: 'percentage',
    formatter: (value: number) => formatPercentage(value),
    strokeWidth: 2
  },
  cpc: {
    label: 'CPC',
    color: '#F97316',
    yAxisId: 'currency',
    formatter: (value: number) => formatCurrency(value),
    strokeWidth: 2
  },
  roas: {
    label: 'ROAS',
    color: '#06B6D4',
    yAxisId: 'ratio',
    formatter: (value: number) => `${value.toFixed(2)}x`,
    strokeWidth: 2
  },
  revenue: {
    label: 'Revenue',
    color: '#84CC16',
    yAxisId: 'currency',
    formatter: (value: number) => formatCurrency(value),
    strokeWidth: 2
  }
};

export const PerformanceChart: React.FC<PerformanceChartProps> = ({
  data = [],
  loading = false,
  height = 300,
  showLegend = true,
  showGrid = true,
  showTooltip = true,
  chartType = 'line',
  metrics = defaultMetrics,
  colors = defaultColors,
  className = '',
  onDataPointClick
}) => {
  const [visibleMetrics, setVisibleMetrics] = useState<Set<string>>(new Set(metrics));
  const [hoveredMetric, setHoveredMetric] = useState<string | null>(null);

  // Process and format data
  const chartData = useMemo(() => {
    return data.map(point => ({
      ...point,
      date: new Date(point.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      })
    }));
  }, [data]);

  // Calculate trend for each metric
  const trends = useMemo(() => {
    const trends: Record<string, { direction: 'up' | 'down' | 'stable'; percentage: number }> = {};
    
    metrics.forEach(metric => {
      const values = data.map(d => d[metric as keyof ChartDataPoint] as number).filter(v => v !== undefined);
      if (values.length < 2) {
        trends[metric] = { direction: 'stable', percentage: 0 };
        return;
      }
      
      const first = values[0];
      const last = values[values.length - 1];
      const change = ((last - first) / first) * 100;
      
      trends[metric] = {
        direction: change > 5 ? 'up' : change < -5 ? 'down' : 'stable',
        percentage: Math.abs(change)
      };
    });
    
    return trends;
  }, [data, metrics]);

  // Toggle metric visibility
  const toggleMetric = (metric: string) => {
    const newVisible = new Set(visibleMetrics);
    if (newVisible.has(metric)) {
      newVisible.delete(metric);
    } else {
      newVisible.add(metric);
    }
    setVisibleMetrics(newVisible);
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
        <p className="font-medium text-gray-900 mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between space-x-3">
            <div className="flex items-center space-x-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm text-gray-600">{entry.name}:</span>
            </div>
            <span className="font-medium text-gray-900">
              {metricConfig[entry.dataKey as keyof typeof metricConfig]?.formatter(entry.value) || entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  };

  // Loading state
  if (loading) {
    return (
      <div className={`relative ${className}`} style={{ height }}>
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-lg">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-500">Loading chart data...</p>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (chartData.length === 0) {
    return (
      <div className={`relative ${className}`} style={{ height }}>
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-lg">
          <div className="text-center">
            <ChartLineIcon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No data available</p>
          </div>
        </div>
      </div>
    );
  }

  const renderChart = () => {
    const commonProps = {
      width: '100%',
      height,
      data: chartData,
      margin: { top: 20, right: 30, left: 20, bottom: 5 },
      onClick: onDataPointClick
    };

    switch (chartType) {
      case 'area':
        return (
          <AreaChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />}
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 12, fill: '#6B7280' }}
              axisLine={{ stroke: '#E5E7EB' }}
            />
            <YAxis 
              tick={{ fontSize: 12, fill: '#6B7280' }}
              axisLine={{ stroke: '#E5E7EB' }}
            />
            {showTooltip && <Tooltip content={<CustomTooltip />} />}
            {showLegend && <Legend />}
            
            {metrics.map((metric, index) => {
              const config = metricConfig[metric as keyof typeof metricConfig];
              const isVisible = visibleMetrics.has(metric);
              
              return (
                <Area
                  key={metric}
                  type="monotone"
                  dataKey={metric}
                  stroke={config?.color || colors[index % colors.length]}
                  fill={config?.color || colors[index % colors.length]}
                  fillOpacity={0.3}
                  strokeWidth={config?.strokeWidth || 2}
                  name={config?.label || metric}
                  hide={!isVisible}
                />
              );
            })}
          </AreaChart>
        );

      case 'bar':
        return (
          <BarChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />}
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 12, fill: '#6B7280' }}
              axisLine={{ stroke: '#E5E7EB' }}
            />
            <YAxis 
              tick={{ fontSize: 12, fill: '#6B7280' }}
              axisLine={{ stroke: '#E5E7EB' }}
            />
            {showTooltip && <Tooltip content={<CustomTooltip />} />}
            {showLegend && <Legend />}
            
            {metrics.map((metric, index) => {
              const config = metricConfig[metric as keyof typeof metricConfig];
              const isVisible = visibleMetrics.has(metric);
              
              return (
                <Bar
                  key={metric}
                  dataKey={metric}
                  fill={config?.color || colors[index % colors.length]}
                  name={config?.label || metric}
                  hide={!isVisible}
                />
              );
            })}
          </BarChart>
        );

      default: // line
        return (
          <LineChart {...commonProps}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />}
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 12, fill: '#6B7280' }}
              axisLine={{ stroke: '#E5E7EB' }}
            />
            <YAxis 
              tick={{ fontSize: 12, fill: '#6B7280' }}
              axisLine={{ stroke: '#E5E7EB' }}
            />
            {showTooltip && <Tooltip content={<CustomTooltip />} />}
            {showLegend && <Legend />}
            
            {metrics.map((metric, index) => {
              const config = metricConfig[metric as keyof typeof metricConfig];
              const isVisible = visibleMetrics.has(metric);
              
              return (
                <Line
                  key={metric}
                  type="monotone"
                  dataKey={metric}
                  stroke={config?.color || colors[index % colors.length]}
                  strokeWidth={config?.strokeWidth || 2}
                  dot={{ fill: config?.color || colors[index % colors.length], strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                  name={config?.label || metric}
                  hide={!isVisible}
                />
              );
            })}
          </LineChart>
        );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`bg-white rounded-lg ${className}`}
    >
      {/* Chart Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-medium text-gray-900">Performance Overview</h3>
          
          {/* Metric Toggle Buttons */}
          <div className="flex items-center space-x-2">
            {metrics.map(metric => {
              const config = metricConfig[metric as keyof typeof metricConfig];
              const trend = trends[metric];
              const isVisible = visibleMetrics.has(metric);
              
              return (
                <button
                  key={metric}
                  onClick={() => toggleMetric(metric)}
                  onMouseEnter={() => setHoveredMetric(metric)}
                  onMouseLeave={() => setHoveredMetric(null)}
                  className={`
                    flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium transition-all
                    ${isVisible 
                      ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                      : 'bg-gray-100 text-gray-600 border border-gray-200'
                    }
                    ${hoveredMetric === metric ? 'scale-105 shadow' : ''}
                  `}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: config?.color || '#9CA3AF' }}
                  />
                  <span>{config?.label || metric}</span>
                  {trend && (
                    <div className="flex items-center">
                      {trend.direction === 'up' ? (
                        <ArrowTrendingUpIcon className="h-3 w-3 text-green-500" />
                      ) : trend.direction === 'down' ? (
                        <ArrowTrendingDownIcon className="h-3 w-3 text-red-500" />
                      ) : null}
                    </div>
                  )}
                  {isVisible ? (
                    <EyeIcon className="h-3 w-3" />
                  ) : (
                    <EyeSlashIcon className="h-3 w-3" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Chart Type Selector */}
        <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
          {[
            { type: 'line', icon: ChartLineIcon, label: 'Line' },
            { type: 'area', icon: ChartBarIcon, label: 'Area' },
            { type: 'bar', icon: ChartBarIcon, label: 'Bar' }
          ].map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              onClick={() => {}} // This would be handled by parent component
              className={`
                flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors
                ${chartType === type 
                  ? 'bg-white text-blue-600 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
                }
              `}
              title={`Switch to ${label} chart`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Chart Container */}
      <div className="p-4">
        <ResponsiveContainer width="100%" height={height}>
          {renderChart()}
        </ResponsiveContainer>
      </div>

      {/* Chart Summary */}
      <div className="px-4 pb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {metrics.filter(metric => visibleMetrics.has(metric)).map(metric => {
            const config = metricConfig[metric as keyof typeof metricConfig];
            const trend = trends[metric];
            const latestValue = chartData[chartData.length - 1]?.[metric as keyof ChartDataPoint] as number;
            
            return (
              <div key={metric} className="text-center">
                <div className="flex items-center justify-center space-x-1 mb-1">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: config?.color }}
                  />
                  <span className="text-xs text-gray-500">{config?.label}</span>
                  {trend && (
                    <div className="flex items-center">
                      {trend.direction === 'up' ? (
                        <ArrowTrendingUpIcon className="h-3 w-3 text-green-500" />
                      ) : trend.direction === 'down' ? (
                        <ArrowTrendingDownIcon className="h-3 w-3 text-red-500" />
                      ) : null}
                      <span className={`text-xs ml-1 ${
                        trend.direction === 'up' ? 'text-green-600' : 
                        trend.direction === 'down' ? 'text-red-600' : 'text-gray-500'
                      }`}>
                        {trend.percentage.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
                <div className="font-medium text-gray-900">
                  {config?.formatter(latestValue || 0) || '—'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};

export default PerformanceChart;