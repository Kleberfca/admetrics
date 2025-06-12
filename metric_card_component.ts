// frontend/src/components/dashboard/MetricCard.tsx
import React from 'react';
import { motion } from 'framer-motion';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MinusIcon
} from '@heroicons/react/24/outline';
import { formatPercentage } from '../../utils/formatters';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'neutral';
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'gray';
  loading?: boolean;
  onClick?: () => void;
  subtitle?: string;
  helpText?: string;
  showTrend?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const colorClasses = {
  blue: {
    bg: 'bg-blue-50',
    icon: 'text-blue-600',
    border: 'border-blue-200',
    hover: 'hover:bg-blue-100'
  },
  green: {
    bg: 'bg-green-50',
    icon: 'text-green-600',
    border: 'border-green-200',
    hover: 'hover:bg-green-100'
  },
  purple: {
    bg: 'bg-purple-50',
    icon: 'text-purple-600',
    border: 'border-purple-200',
    hover: 'hover:bg-purple-100'
  },
  orange: {
    bg: 'bg-orange-50',
    icon: 'text-orange-600',
    border: 'border-orange-200',
    hover: 'hover:bg-orange-100'
  },
  red: {
    bg: 'bg-red-50',
    icon: 'text-red-600',
    border: 'border-red-200',
    hover: 'hover:bg-red-100'
  },
  gray: {
    bg: 'bg-gray-50',
    icon: 'text-gray-600',
    border: 'border-gray-200',
    hover: 'hover:bg-gray-100'
  }
};

const sizeClasses = {
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8'
};

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  change,
  trend,
  icon: Icon,
  color = 'blue',
  loading = false,
  onClick,
  subtitle,
  helpText,
  showTrend = true,
  size = 'md'
}) => {
  const colors = colorClasses[color];
  const isClickable = !!onClick;

  const getTrendIcon = () => {
    switch (trend) {
      case 'up':
        return ArrowTrendingUpIcon;
      case 'down':
        return ArrowTrendingDownIcon;
      default:
        return MinusIcon;
    }
  };

  const getTrendColor = () => {
    switch (trend) {
      case 'up':
        return 'text-green-600 bg-green-100';
      case 'down':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className={`p-3 rounded-lg ${colors.bg}`}>
                <div className="h-6 w-6 bg-gray-300 rounded"></div>
              </div>
            </div>
            <div className="h-4 bg-gray-300 rounded w-16"></div>
          </div>
          
          <div className="mt-4">
            <div className="h-3 bg-gray-300 rounded w-24 mb-2"></div>
            <div className="h-8 bg-gray-300 rounded w-32"></div>
          </div>
          
          {showTrend && (
            <div className="mt-4 flex items-center">
              <div className="h-4 bg-gray-300 rounded w-20"></div>
            </div>
          )}
        </div>
      );
    }

    return (
      <>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className={`p-3 rounded-lg ${colors.bg} ${colors.border} border`}>
              <Icon className={`h-6 w-6 ${colors.icon}`} />
            </div>
            {helpText && (
              <div className="ml-2 group relative">
                <button className="text-gray-400 hover:text-gray-600">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                </button>
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 text-sm text-white bg-gray-900 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 whitespace-nowrap">
                  {helpText}
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            )}
          </div>
          
          {isClickable && (
            <button className="text-gray-400 hover:text-gray-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 truncate">
                {title}
              </p>
              {subtitle && (
                <p className="text-xs text-gray-500 mt-1 truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          
          <div className="mt-2">
            <p className="text-2xl font-bold text-gray-900 truncate">
              {value}
            </p>
          </div>
        </div>

        {/* Trend */}
        {showTrend && change !== undefined && trend && (
          <div className="mt-4 flex items-center">
            <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getTrendColor()}`}>
              {React.createElement(getTrendIcon(), { className: 'h-3 w-3 mr-1' })}
              {formatPercentage(Math.abs(change))}
            </div>
            <span className="ml-2 text-xs text-gray-500">
              vs previous period
            </span>
          </div>
        )}
      </>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`
        bg-white rounded-lg shadow-sm border border-gray-200 ${sizeClasses[size]}
        ${isClickable ? `cursor-pointer ${colors.hover} transition-colors duration-200` : ''}
      `}
      onClick={onClick}
      whileHover={isClickable ? { scale: 1.02 } : undefined}
      whileTap={isClickable ? { scale: 0.98 } : undefined}
    >
      {renderContent()}
    </motion.div>
  );
};

// Skeleton component for loading states
export const MetricCardSkeleton: React.FC<{ count?: number }> = ({ count = 1 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <MetricCard
          key={index}
          title=""
          value=""
          icon={() => <div />}
          loading={true}
        />
      ))}
    </>
  );
};

// Preset metric cards
export const SpendMetricCard: React.FC<Omit<MetricCardProps, 'icon' | 'color'>> = (props) => (
  <MetricCard
    {...props}
    icon={props.icon || ((props: any) => (
      <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
      </svg>
    ))}
    color="blue"
  />
);

export const ClicksMetricCard: React.FC<Omit<MetricCardProps, 'icon' | 'color'>> = (props) => (
  <MetricCard
    {...props}
    icon={props.icon || ((props: any) => (
      <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
      </svg>
    ))}
    color="green"
  />
);

export const ConversionsMetricCard: React.FC<Omit<MetricCardProps, 'icon' | 'color'>> = (props) => (
  <MetricCard
    {...props}
    icon={props.icon || ((props: any) => (
      <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ))}
    color="purple"
  />
);

export const ROASMetricCard: React.FC<Omit<MetricCardProps, 'icon' | 'color'>> = (props) => (
  <MetricCard
    {...props}
    icon={props.icon || ArrowTrendingUpIcon}
    color="orange"
  />
);

export default MetricCard;