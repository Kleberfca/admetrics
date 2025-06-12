// frontend/src/components/common/LoadingSpinner.tsx
import React from 'react';
import { motion } from 'framer-motion';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'blue' | 'white' | 'gray';
  className?: string;
  text?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12'
};

const colorClasses = {
  blue: 'text-blue-600',
  white: 'text-white',
  gray: 'text-gray-600'
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  color = 'blue',
  className = '',
  text
}) => {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="flex flex-col items-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className={`${sizeClasses[size]} ${colorClasses[color]}`}
        >
          <svg
            className="animate-spin h-full w-full"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        </motion.div>
        {text && (
          <p className={`mt-2 text-sm ${colorClasses[color]}`}>
            {text}
          </p>
        )}
      </div>
    </div>
  );
};

// ---

// frontend/src/components/common/ErrorAlert.tsx
import React from 'react';
import { motion } from 'framer-motion';
import {
  ExclamationTriangleIcon,
  XMarkIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

interface ErrorAlertProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  retryText?: string;
  dismissText?: string;
  variant?: 'error' | 'warning' | 'info';
  className?: string;
}

const variantClasses = {
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'text-red-400',
    title: 'text-red-800',
    message: 'text-red-700',
    button: 'bg-red-100 text-red-800 hover:bg-red-200'
  },
  warning: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    icon: 'text-yellow-400',
    title: 'text-yellow-800',
    message: 'text-yellow-700',
    button: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: 'text-blue-400',
    title: 'text-blue-800',
    message: 'text-blue-700',
    button: 'bg-blue-100 text-blue-800 hover:bg-blue-200'
  }
};

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  title = 'Error',
  message,
  onRetry,
  onDismiss,
  retryText = 'Try Again',
  dismissText = 'Dismiss',
  variant = 'error',
  className = ''
}) => {
  const classes = variantClasses[variant];

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`rounded-md ${classes.bg} ${classes.border} border p-4 ${className}`}
    >
      <div className="flex">
        <div className="flex-shrink-0">
          <ExclamationTriangleIcon className={`h-5 w-5 ${classes.icon}`} />
        </div>
        <div className="ml-3 flex-1">
          <h3 className={`text-sm font-medium ${classes.title}`}>
            {title}
          </h3>
          <p className={`mt-1 text-sm ${classes.message}`}>
            {message}
          </p>
          {(onRetry || onDismiss) && (
            <div className="mt-4 flex space-x-3">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className={`inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md ${classes.button} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-${variant}-50 focus:ring-${variant}-600 transition-colors`}
                >
                  <ArrowPathIcon className="h-4 w-4 mr-2" />
                  {retryText}
                </button>
              )}
              {onDismiss && (
                <button
                  onClick={onDismiss}
                  className={`inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md ${classes.button} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-${variant}-50 focus:ring-${variant}-600 transition-colors`}
                >
                  <XMarkIcon className="h-4 w-4 mr-2" />
                  {dismissText}
                </button>
              )}
            </div>
          )}
        </div>
        {onDismiss && (
          <div className="ml-auto pl-3">
            <div className="-mx-1.5 -my-1.5">
              <button
                onClick={onDismiss}
                className={`inline-flex rounded-md ${classes.bg} p-1.5 ${classes.icon} hover:bg-${variant}-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-${variant}-50 focus:ring-${variant}-600`}
              >
                <span className="sr-only">Dismiss</span>
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// ---

// frontend/src/components/common/DateRangePicker.tsx
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';

interface DateRangePickerProps {
  startDate: Date;
  endDate: Date;
  onChange: (dateRange: { startDate: Date; endDate: Date }) => void;
  className?: string;
  disabled?: boolean;
}

const presetRanges = [
  {
    label: 'Last 7 days',
    getValue: () => ({
      startDate: subDays(new Date(), 6),
      endDate: new Date()
    })
  },
  {
    label: 'Last 30 days',
    getValue: () => ({
      startDate: subDays(new Date(), 29),
      endDate: new Date()
    })
  },
  {
    label: 'Last 90 days',
    getValue: () => ({
      startDate: subDays(new Date(), 89),
      endDate: new Date()
    })
  },
  {
    label: 'This month',
    getValue: () => ({
      startDate: startOfMonth(new Date()),
      endDate: endOfMonth(new Date())
    })
  },
  {
    label: 'This year',
    getValue: () => ({
      startDate: startOfYear(new Date()),
      endDate: endOfYear(new Date())
    })
  }
];

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onChange,
  className = '',
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(format(startDate, 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState(format(endDate, 'yyyy-MM-dd'));
  const dropdownRef = useRef<HTMLDivElement>(null);

  const formatDateRange = (start: Date, end: Date) => {
    const startStr = format(start, 'MMM d');
    const endStr = format(end, 'MMM d, yyyy');
    return `${startStr} - ${endStr}`;
  };

  const handlePresetSelect = (preset: typeof presetRanges[0]) => {
    const range = preset.getValue();
    onChange(range);
    setIsOpen(false);
  };

  const handleCustomDateSubmit = () => {
    const newStartDate = new Date(customStartDate);
    const newEndDate = new Date(customEndDate);
    
    if (newStartDate <= newEndDate) {
      onChange({
        startDate: newStartDate,
        endDate: newEndDate
      });
      setIsOpen(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700
          ${disabled 
            ? 'opacity-50 cursor-not-allowed' 
            : 'hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
          }
        `}
      >
        <CalendarIcon className="h-4 w-4 mr-2 text-gray-500" />
        {formatDateRange(startDate, endDate)}
        <ChevronDownIcon className={`ml-2 h-4 w-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 mt-2 w-80 bg-white rounded-md shadow-lg border border-gray-200 z-50"
          >
            <div className="p-4">
              {/* Presets */}
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Quick Select</h4>
                <div className="grid grid-cols-1 gap-1">
                  {presetRanges.map((preset, index) => (
                    <button
                      key={index}
                      onClick={() => handlePresetSelect(preset)}
                      className="text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Date Range */}
              <div className="border-t border-gray-200 pt-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Custom Range</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-end space-x-2">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="px-3 py-2 text-sm text-gray-700 hover:text-gray-900"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCustomDateSubmit}
                    className="px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ---

// frontend/src/components/common/EmptyState.tsx
import React from 'react';
import { motion } from 'framer-motion';

interface EmptyStateProps {
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionText,
  onAction,
  className = ''
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`text-center py-12 ${className}`}
    >
      {Icon && (
        <Icon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
      )}
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
          {description}
        </p>
      )}
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          {actionText}
        </button>
      )}
    </motion.div>
  );
};

export default {
  LoadingSpinner,
  ErrorAlert,
  DateRangePicker,
  EmptyState
};