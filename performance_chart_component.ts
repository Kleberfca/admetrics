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
  Area,
  AreaChart,
  ComposedChart,
  Bar,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChartBarIcon,
  EyeIcon,
  CursorArrowRaysIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';
import { format, parseISO, isValid } from 'date-fns';

import LoadingSpinner from '../common/LoadingSpinner';
import { formatCurrency, formatNumber, formatPercentage } from '../../utils/formatters';

interface MetricDataPoint {
  date: string;
  spend?: number;
  clicks?: number;
  impressions?: number;
  conversions?: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  roas?: number;
  conversionRate?: number;
  costPerConversion?: number;
  [key: string]: any;
}

interface PerformanceChartProps {
  data?: MetricDataPoint[];
  comparisonData?: MetricDataPoint[];
  loading?: boolean;
  selectedMetric?: string;
  height?: number;
  showComparison?: boolean;
  showTooltip?: boolean;
  showLegend?: boolean;
  chartType?: 'line' | 'area' | 'bar' | 'composed';
  timeGranularity?: 'hour' | 'day' | 'week' | 'month';
  onMetricChange?: (metric: string) => void;
  onDataPointClick?: (dataPoint: MetricDataPoint) => void;
  className?: string;
}

const METRIC_CONFIGS = {
  spend: {
    label: 'Spend',
    color: '#DC2626',
    secondaryColor: '#FCA5A5',
    icon: CurrencyDollarIcon,
    formatter: formatCurrency,
    yAxisDomain: [0, 'dataMax'],
  },
  clicks: {
    label: 'Clicks',
    color: '#2563EB',
    secondaryColor: '#93C5FD',
    icon: CursorArrowRaysIcon,
    formatter: formatNumber,
    yAxisDomain: [0, 'dataMax'],
  },
  impressions: {
    label: 'Impressions',
    color: '#7C3AED',
    secondaryColor: '#C4B5FD',
    icon: EyeIcon,
    formatter: formatNumber,
    yAxisDomain: [0, 'dataMax'],
  },
  conversions: {
    label: 'Conversions',
    color: '#059669',
    secondaryColor: '#6EE7B7',
    icon: ChartBarIcon,
    formatter: formatNumber,
    yAxisDomain: [0, 'dataMax'],
  },
  ctr: {
    label: 'CTR (%)',
    color: '#D97706',
    secondaryColor: '#FCD34D',
    icon: ArrowTrendingUpIcon,
    formatter: (value: number) => formatPercentage(value),
    yAxisDomain: [0, 'dataMax'],
  },
  cpc: {
    label: 'CPC',
    color: '#DC2626',
    secondaryColor: '#FCA5A5',
    icon: CurrencyDollarIcon,
    formatter: formatCurrency,
    yAxisDomain: [0, 'dataMax'],
  },
  roas: {
    label: 'ROAS',
    color: '#059669',
    secondaryColor: '#6EE7B7',
    icon: ArrowTrendingUpIcon,
    formatter: (value: number) => `${formatNumber(value, 2)}x`,
    yAxisDomain: [0, 'dataMax'],
  },
  conversionRate: {
    label: 'Conv. Rate (%)',
    color: '#7C3AED',
    secondaryColor: '#C4B5FD',
    icon: ChartBarIcon,
    formatter: (value: number) => formatPercentage(value),
    yAxisDomain: [0, 'dataMax'],
  },
};

const PerformanceChart: React.FC<PerformanceChartProps> = ({
  data = [],
  comparisonData = [],
  loading = false,
  selectedMetric = 'spend',
  height = 400,
  showComparison = true,
  showTooltip = true,
  showLegend = true,
  chartType = 'line',
  timeGranularity = 'day',
  onMetricChange,
  onDataPointClick,
  className = '',
}) => {
  const [hoveredDataPoint, setHoveredDataPoint] = useState<MetricDataPoint | null>(null);

  const metricConfig = METRIC_CONFIGS[selectedMetric] || METRIC_CONFIGS.spend;

  // Process and merge data for display
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    return data.map(dataPoint => {
      const date = parseISO(dataPoint.date);
      const comparisonPoint = comparisonData.find(cp => 
        parseISO(cp.date).getTime() === date.getTime()
      );

      return {
        ...dataPoint,
        formattedDate: isValid(date) ? format(date, getDateFormat(timeGranularity)) : dataPoint.date,
        comparison: comparisonPoint ? comparisonPoint[selectedMetric] : null,
      };
    }).sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());
  }, [data, comparisonData, selectedMetric, timeGranularity]);

  const getDateFormat = (granularity: string) => {
    switch (granularity) {
      case 'hour':
        return 'MMM dd, HH:mm';
      case 'day':
        return 'MMM dd';
      case 'week':
        return "'Week of' MMM dd";
      case 'month':
        return 'MMM yyyy';
      default:
        return 'MMM dd';
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 min-w-48">
          <p className="font-medium text-gray-900 mb-2">{label}</p>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div 
                  className="w-3 h-3 rounded-full mr-2"
                  style={{ backgroundColor: metricConfig.color }}
                />
                <span className="text-sm text-gray-600">Current</span>
              </div>
              <span className="font-medium">
                {metricConfig.formatter(payload[0].value)}
              </span>
            </div>
            
            {showComparison && data.comparison !== null && (
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div 
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: metricConfig.secondaryColor }}
                  />
                  <span className="text-sm text-gray-600">Previous</span>
                </div>
                <span className="font-medium">
                  {metricConfig.formatter(data.comparison)}
                </span>
              </div>
            )}
            
            {data.comparison !== null && (
              <div className="pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Change</span>
                  <span className={`font-medium ${
                    payload[0].value > data.comparison 
                      ? 'text-green-600' 
                      : payload[0].value < data.comparison 
                        ? 'text-red-600' 
                        : 'text-gray-600'
                  }`}>
                    {payload[0].value > data.comparison ? '+' : ''}
                    {formatPercentage(
                      ((payload[0].value - data.comparison) / data.comparison) * 100
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 5, right: 30, left: 20, bottom: 5 },
      onMouseMove: (e: any) => {
        if (e && e.activePayload && e.activePayload[0]) {
          setHoveredDataPoint(e.activePayload[0].payload);
        }
      },
      onMouseLeave: () => setHoveredDataPoint(null),
      onClick: (e: any) => {
        if (e && e.activePayload && e.activePayload[0] && onDataPointClick) {
          onDataPointClick(e.activePayload[0].payload);
        }
      },
    };

    const xAxisProps = {
      dataKey: 'formattedDate',
      axisLine: false,
      tickLine: false,
      tick: { fontSize: 12, fill: '#6B7280' },
    };

    const yAxisProps = {
      axisLine: false,
      tickLine: false,
      tick: { fontSize: 12, fill: '#6B7280' },
      tickFormatter: metricConfig.formatter,
      domain: metricConfig.yAxisDomain,
    };

    switch (chartType) {
      case 'area':
        return (
          <AreaChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            {showTooltip && <Tooltip content={<CustomTooltip />} />}
            {showLegend && <Legend />}
            
            {showComparison && (
              <Area
                type="monotone"
                dataKey="comparison"
                stackId="1"
                stroke={metricConfig.secondaryColor}
                fill={metricConfig.secondaryColor}
                fillOpacity={0.3}
                name="Previous Period"
                dot={false}
              />
            )}
            
            <Area
              type="monotone"
              dataKey={selectedMetric}
              stackId="2"
              stroke={metricConfig.color}
              fill={metricConfig.color}
              fillOpacity={0.4}
              name={metricConfig.label}
              dot={{ r: 4, strokeWidth: 2 }}
              activeDot={{ r: 6, strokeWidth: 2 }}
            />
          </AreaChart>
        );

      case 'bar':
        return (
          <ComposedChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            {showTooltip && <Tooltip content={<CustomTooltip />} />}
            {showLegend && <Legend />}
            
            {showComparison && (
              <Bar
                dataKey="comparison"
                fill={metricConfig.secondaryColor}
                name="Previous Period"
                opacity={0.7}
              />
            )}
            
            <Bar
              dataKey={selectedMetric}
              fill={metricConfig.color}
              name={metricConfig.label}
            />
          </ComposedChart>
        );

      case 'composed':
        return (
          <ComposedChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            {showTooltip && <Tooltip content={<CustomTooltip />} />}
            {showLegend && <Legend />}
            
            {showComparison && (
              <Line
                type="monotone"
                dataKey="comparison"
                stroke={metricConfig.secondaryColor}
                strokeWidth={2}
                strokeDasharray="5 5"
                name="Previous Period"
                dot={false}
              />
            )}
            
            <Bar
              dataKey={selectedMetric}
              fill={metricConfig.color}
              name={metricConfig.label}
              opacity={0.7}
            />
          </ComposedChart>
        );

      default: // line
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            {showTooltip && <Tooltip content={<CustomTooltip />} />}
            {showLegend && <Legend />}
            
            {showComparison && (
              <Line
                type="monotone"
                dataKey="comparison"
                stroke={metricConfig.secondaryColor}
                strokeWidth={2}
                strokeDasharray="5 5"
                name="Previous Period"
                dot={false}
                activeDot={{ r: 4 }}
              />
            )}
            
            <Line
              type="monotone"
              dataKey={selectedMetric}
              stroke={metricConfig.color}
              strokeWidth={3}
              name={metricConfig.label}
              dot={{ r: 4, strokeWidth: 2 }}
              activeDot={{ r: 6, strokeWidth: 2 }}
            />
          </LineChart>
        );
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ height }}>
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-sm text-gray-500">Loading chart data...</p>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ height }}>
        <div className="text-center">
          <ChartBarIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-sm text-gray-500">No data available for the selected period</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      {/* Metric Selector */}
      {onMetricChange && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(METRIC_CONFIGS).map(([key, config]) => {
            const Icon = config.icon;
            return (
              <button
                key={key}
                onClick={() => onMetricChange(key)}
                className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedMetric === key
                    ? 'bg-blue-100 text-blue-700 border border-blue-200'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <Icon className="h-4 w-4 mr-2" />
                {config.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Chart */}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedMetric}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{ width: '100%', height: '100%' }}
            >
              {renderChart()}
            </motion.div>
          </AnimatePresence>
        </ResponsiveContainer>
      </div>

      {/* Hovered Data Point Info */}
      <AnimatePresence>
        {hoveredDataPoint && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Date</p>
                <p className="font-medium">{hoveredDataPoint.formattedDate}</p>
              </div>
              <div>
                <p className="text-gray-600">{metricConfig.label}</p>
                <p className="font-medium">
                  {metricConfig.formatter(hoveredDataPoint[selectedMetric] || 0)}
                </p>
              </div>
              {hoveredDataPoint.clicks && (
                <div>
                  <p className="text-gray-600">Clicks</p>
                  <p className="font-medium">{formatNumber(hoveredDataPoint.clicks)}</p>
                </div>
              )}
              {hoveredDataPoint.impressions && (
                <div>
                  <p className="text-gray-600">Impressions</p>
                  <p className="font-medium">{formatNumber(hoveredDataPoint.impressions)}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PerformanceChart;