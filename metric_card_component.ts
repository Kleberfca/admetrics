import React from 'react';
import { motion } from 'framer-motion';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MinusIcon,
} from '@heroicons/react/24/outline';
import { formatPercentage } from '../../utils/formatters';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ComponentType<{ className?: string }>;
  trend?: 'up' | 'down' | 'neutral';
  loading?: boolean;
  subtitle?: string;
  onClick?: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'gray';
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  change,
  icon: Icon,
  trend = 'neutral',
  loading = false,
  subtitle,
  onClick,
  className = '',
  size = 'md',
  color = 'blue',
}) => {
  const sizeClasses = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  const colorClasses = {
    blue: 'text-blue-600 bg-blue-50',
    green: 'text-green-600 bg-green-50',
    red: 'text-red-600 bg-red-50',
    yellow: 'text-yellow-600 bg-yellow-50',
    purple: 'text-purple-600 bg-purple-50',
    gray: 'text-gray-600 bg-gray-50',
  };

  const getTrendColor = (trend: string, change?: number) => {
    if (change === undefined || change === 0) return 'text-gray-500';
    
    switch (trend) {
      case 'up':
        return change > 0 ? 'text-green-600' : 'text-red-600';
      case 'down':
        return change < 0 ? 'text-green-600' : 'text-red-600';
      default:
        return change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-500';
    }
  };

  const getTrendIcon = (trend: string, change?: number) => {
    if (change === undefined || change === 0) {
      return <MinusIcon className="h-4 w-4" />;
    }
    
    if (change > 0) {
      return <ArrowTrendingUpIcon className="h-4 w-4" />;
    } else if (change < 0) {
      return <ArrowTrendingDownIcon className="h-4 w-4" />;
    } else {
      return <MinusIcon className="h-4 w-4" />;
    }
  };

  const cardContent = (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${sizeClasses[size]} ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center">
            <div className={`flex-shrink-0 p-3 rounded-lg ${colorClasses[color]}`}>
              <Icon className="h-6 w-6" />
            </div>
            <div className="ml-4 flex-1">
              <p className="text-sm font-medium text-gray-600 truncate">{title}</p>
              {subtitle && (
                <p className="text-xs text-gray-500 mt-1 truncate">{subtitle}</p>
              )}
            </div>
          </div>
          
          <div className="mt-4">
            {loading ? (
              <div className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-24 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-16"></div>
              </div>
            ) : (
              <>
                <div className="flex items-baseline">
                  <p className="text-2xl font-bold text-gray-900 truncate">
                    {value}
                  </p>
                </div>
                
                {change !== undefined && (
                  <div className={`flex items-center mt-2 ${getTrendColor(trend, change)}`}>
                    {getTrendIcon(trend, change)}
                    <span className="ml-1 text-sm font-medium">
                      {change > 0 ? '+' : ''}{formatPercentage(Math.abs(change))}
                    </span>
                    <span className="ml-1 text-xs text-gray-500">vs previous period</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (onClick) {
    return (
      <motion.button
        onClick={onClick}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-lg"
      >
        {cardContent}
      </motion.button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {cardContent}
    </motion.div>
  );
};

// Grid component for organizing metric cards
interface MetricCardsGridProps {
  children: React.ReactNode;
  columns?: 1 | 2 | 3 | 4 | 5 | 6;
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const MetricCardsGrid: React.FC<MetricCardsGridProps> = ({
  children,
  columns = 4,
  gap = 'md',
  className = '',
}) => {
  const columnClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
    6: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
  };

  const gapClasses = {
    sm: 'gap-4',
    md: 'gap-6',
    lg: 'gap-8',
  };

  return (
    <div className={`grid ${columnClasses[columns]} ${gapClasses[gap]} ${className}`}>
      {children}
    </div>
  );
};

// Skeleton loading component
export const MetricCardSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <MetricCardsGrid columns={count as any}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse"
        >
          <div className="flex items-center">
            <div className="flex-shrink-0 p-3 bg-gray-200 rounded-lg">
              <div className="h-6 w-6 bg-gray-300 rounded"></div>
            </div>
            <div className="ml-4 flex-1">
              <div className="h-4 bg-gray-200 rounded w-20 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-16"></div>
            </div>
          </div>
          
          <div className="mt-4">
            <div className="h-8 bg-gray-200 rounded w-24 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-32"></div>
          </div>
        </div>
      ))}
    </MetricCardsGrid>
  );
};

// Compact metric card variant
interface CompactMetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  loading?: boolean;
  className?: string;
}

export const CompactMetricCard: React.FC<CompactMetricCardProps> = ({
  title,
  value,
  change,
  loading = false,
  className = '',
}) => {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`}>
      {loading ? (
        <div className="animate-pulse">
          <div className="h-3 bg-gray-200 rounded w-16 mb-2"></div>
          <div className="h-6 bg-gray-200 rounded w-20 mb-1"></div>
          <div className="h-3 bg-gray-200 rounded w-12"></div>
        </div>
      ) : (
        <>
          <p className="text-xs font-medium text-gray-600 truncate">{title}</p>
          <p className="text-lg font-bold text-gray-900 mt-1 truncate">{value}</p>
          {change !== undefined && (
            <div className={`flex items-center mt-1 ${
              change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-500'
            }`}>
              {change > 0 ? (
                <ArrowTrendingUpIcon className="h-3 w-3" />
              ) : change < 0 ? (
                <ArrowTrendingDownIcon className="h-3 w-3" />
              ) : (
                <MinusIcon className="h-3 w-3" />
              )}
              <span className="ml-1 text-xs font-medium">
                {change > 0 ? '+' : ''}{formatPercentage(Math.abs(change))}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Metric card with sparkline
interface SparklineMetricCardProps extends MetricCardProps {
  sparklineData?: number[];
  sparklineColor?: string;
}

export const SparklineMetricCard: React.FC<SparklineMetricCardProps> = ({
  sparklineData = [],
  sparklineColor = '#3B82F6',
  ...props
}) => {
  const maxValue = Math.max(...sparklineData);
  const minValue = Math.min(...sparklineData);
  const range = maxValue - minValue;

  const sparklinePoints = sparklineData.map((value, index) => {
    const x = (index / (sparklineData.length - 1)) * 100;
    const y = range > 0 ? ((maxValue - value) / range) * 100 : 50;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="relative">
      <MetricCard {...props} />
      
      {sparklineData.length > 1 && !props.loading && (
        <div className="absolute bottom-2 right-2 w-16 h-8">
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 100 100"
            className="overflow-visible"
          >
            <polyline
              points={sparklinePoints}
              fill="none"
              stroke={sparklineColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.7"
            />
          </svg>
        </div>
      )}
    </div>
  );
};

export default MetricCard;