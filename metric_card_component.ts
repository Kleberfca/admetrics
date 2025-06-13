import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency, formatNumber, formatPercentage } from '../../utils/formatters';
import clsx from 'clsx';

interface MetricCardProps {
  title: string;
  value: number;
  previousValue?: number;
  format?: 'currency' | 'number' | 'percentage';
  icon?: React.ReactNode;
  loading?: boolean;
  trend?: {
    value: number;
    label?: string;
  };
  comparison?: {
    value: number;
    label: string;
    period: string;
  };
  description?: string;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'indigo';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  previousValue,
  format = 'number',
  icon,
  loading = false,
  trend,
  comparison,
  description,
  color = 'blue',
  size = 'md',
  className,
  onClick,
}) => {
  // Calculate trend if previous value is provided and trend is not explicitly set
  const calculatedTrend = useMemo(() => {
    if (trend) return trend;
    if (previousValue === undefined) return null;
    
    const change = value - previousValue;
    const percentage = previousValue === 0 ? 
      (value > 0 ? 100 : 0) : 
      ((change / previousValue) * 100);
    
    return {
      value: percentage,
      label: `vs previous period`,
    };
  }, [trend, value, previousValue]);

  // Format the main value
  const formattedValue = useMemo(() => {
    if (loading) return '---';
    
    switch (format) {
      case 'currency':
        return formatCurrency(value);
      case 'percentage':
        return formatPercentage(value);
      case 'number':
      default:
        return formatNumber(value);
    }
  }, [value, format, loading]);

  // Determine trend direction and styling
  const trendDirection = calculatedTrend ? 
    (calculatedTrend.value > 0 ? 'up' : calculatedTrend.value < 0 ? 'down' : 'neutral') : 
    'neutral';

  // Color schemes
  const colorSchemes = {
    blue: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-200 dark:border-blue-800',
      icon: 'text-blue-600 dark:text-blue-400',
      accent: 'text-blue-600 dark:text-blue-400',
    },
    green: {
      bg: 'bg-green-50 dark:bg-green-900/20',
      border: 'border-green-200 dark:border-green-800',
      icon: 'text-green-600 dark:text-green-400',
      accent: 'text-green-600 dark:text-green-400',
    },
    yellow: {
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      border: 'border-yellow-200 dark:border-yellow-800',
      icon: 'text-yellow-600 dark:text-yellow-400',
      accent: 'text-yellow-600 dark:text-yellow-400',
    },
    red: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-200 dark:border-red-800',
      icon: 'text-red-600 dark:text-red-400',
      accent: 'text-red-600 dark:text-red-400',
    },
    purple: {
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      border: 'border-purple-200 dark:border-purple-800',
      icon: 'text-purple-600 dark:text-purple-400',
      accent: 'text-purple-600 dark:text-purple-400',
    },
    indigo: {
      bg: 'bg-indigo-50 dark:bg-indigo-900/20',
      border: 'border-indigo-200 dark:border-indigo-800',
      icon: 'text-indigo-600 dark:text-indigo-400',
      accent: 'text-indigo-600 dark:text-indigo-400',
    },
  };

  const colorScheme = colorSchemes[color];

  // Size variants
  const sizeVariants = {
    sm: {
      container: 'p-4',
      title: 'text-sm',
      value: 'text-xl',
      icon: 'h-5 w-5',
    },
    md: {
      container: 'p-6',
      title: 'text-sm',
      value: 'text-2xl',
      icon: 'h-6 w-6',
    },
    lg: {
      container: 'p-8',
      title: 'text-base',
      value: 'text-3xl',
      icon: 'h-8 w-8',
    },
  };

  const sizeVariant = sizeVariants[size];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={clsx(
        'relative overflow-hidden rounded-lg border bg-white dark:bg-gray-800 shadow-sm transition-all duration-200',
        colorScheme.border,
        onClick && 'cursor-pointer hover:shadow-md',
        sizeVariant.container,
        className
      )}
      onClick={onClick}
    >
      {loading && (
        <div className="absolute inset-0 bg-white/50 dark:bg-gray-800/50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-white"></div>
        </div>
      )}

      <div className="flex items-center">
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <p className={clsx(
              'font-medium text-gray-600 dark:text-gray-300',
              sizeVariant.title
            )}>
              {title}
            </p>
            
            {description && (
              <div className="group relative">
                <InformationCircleIcon className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                <div className="absolute right-0 top-6 hidden group-hover:block z-10">
                  <div className="bg-gray-900 dark:bg-gray-700 text-white text-xs rounded py-1 px-2 whitespace-nowrap">
                    {description}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-baseline space-x-2">
            <p className={clsx(
              'font-bold text-gray-900 dark:text-white',
              sizeVariant.value
            )}>
              {formattedValue}
            </p>

            {calculatedTrend && (
              <div className={clsx(
                'flex items-center text-sm font-medium',
                trendDirection === 'up' && 'text-green-600 dark:text-green-400',
                trendDirection === 'down' && 'text-red-600 dark:text-red-400',
                trendDirection === 'neutral' && 'text-gray-500 dark:text-gray-400'
              )}>
                {trendDirection === 'up' && (
                  <ArrowTrendingUpIcon className="h-4 w-4 mr-1" />
                )}
                {trendDirection === 'down' && (
                  <ArrowTrendingDownIcon className="h-4 w-4 mr-1" />
                )}
                
                <span>
                  {Math.abs(calculatedTrend.value).toFixed(1)}%
                </span>
              </div>
            )}
          </div>

          {calculatedTrend?.label && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {calculatedTrend.label}
            </p>
          )}

          {comparison && (
            <div className="mt-2 text-xs">
              <span className="text-gray-500 dark:text-gray-400">
                {comparison.label}: 
              </span>
              <span className="font-medium text-gray-700 dark:text-gray-300 ml-1">
                {formatNumber(comparison.value)}
              </span>
              <span className="text-gray-500 dark:text-gray-400 ml-1">
                ({comparison.period})
              </span>
            </div>
          )}
        </div>

        {icon && (
          <div className={clsx(
            'flex-shrink-0 rounded-full p-3',
            colorScheme.bg
          )}>
            <div className={clsx(colorScheme.icon, sizeVariant.icon)}>
              {icon}
            </div>
          </div>
        )}
      </div>

      {/* Decorative accent */}
      <div className={clsx(
        'absolute bottom-0 left-0 h-1 w-full opacity-50',
        colorScheme.accent.replace('text-', 'bg-')
      )} />
    </motion.div>
  );
};

// Skeleton loader component
export const MetricCardSkeleton: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ 
  size = 'md' 
}) => {
  const sizeVariants = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  return (
    <div className={clsx(
      'rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm',
      sizeVariants[size]
    )}>
      <div className="animate-pulse">
        <div className="flex items-center justify-between mb-2">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
          <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
        </div>
        <div className="flex items-baseline space-x-2">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-12"></div>
        </div>
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16 mt-2"></div>
      </div>
    </div>
  );
};

// Grid container for multiple metric cards
export const MetricCardsGrid: React.FC<{
  children: React.ReactNode;
  columns?: 1 | 2 | 3 | 4;
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ 
  children, 
  columns = 4, 
  gap = 'md',
  className 
}) => {
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };

  const gapSizes = {
    sm: 'gap-3',
    md: 'gap-4',
    lg: 'gap-6',
  };

  return (
    <div className={clsx(
      'grid',
      gridCols[columns],
      gapSizes[gap],
      className
    )}>
      {children}
    </div>
  );
};

export default MetricCard;