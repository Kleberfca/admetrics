import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  EllipsisVerticalIcon,
  PlayIcon,
  PauseIcon,
  PencilIcon,
  TrashIcon,
  ChartBarIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline';
import { Menu, Transition } from '@headlessui/react';
import { formatCurrency, formatNumber, formatPercentage } from '../../utils/formatters';
import clsx from 'clsx';

interface Campaign {
  id: string;
  name: string;
  platform: string;
  status: 'ACTIVE' | 'PAUSED' | 'ENDED' | 'DRAFT';
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  ctr: number;
  cpc: number;
  roas: number;
  cpl?: number;
  startDate?: string;
  endDate?: string;
  budget?: number;
  objective?: string;
}

interface CampaignTableProps {
  campaigns: Campaign[];
  loading?: boolean;
  onCampaignClick?: (campaign: Campaign) => void;
  onStatusChange?: (campaignId: string, status: Campaign['status']) => void;
  onEdit?: (campaign: Campaign) => void;
  onDelete?: (campaignId: string) => void;
  onDuplicate?: (campaign: Campaign) => void;
  showActions?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  className?: string;
}

type SortKey = keyof Campaign;

const CampaignTable: React.FC<CampaignTableProps> = ({
  campaigns,
  loading = false,
  onCampaignClick,
  onStatusChange,
  onEdit,
  onDelete,
  onDuplicate,
  showActions = true,
  sortBy: initialSortBy = 'spend',
  sortOrder: initialSortOrder = 'desc',
  className,
}) => {
  const [sortBy, setSortBy] = useState<SortKey>(initialSortBy as SortKey);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(initialSortOrder);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<Campaign['status'] | 'ALL'>('ALL');
  const [platformFilter, setPlatformFilter] = useState<string>('ALL');

  // Platform colors and icons
  const platformInfo: Record<string, { color: string; icon: string; name: string }> = {
    GOOGLE_ADS: { color: 'bg-blue-100 text-blue-800', icon: '🔍', name: 'Google Ads' },
    FACEBOOK_ADS: { color: 'bg-blue-100 text-blue-800', icon: '👍', name: 'Facebook' },
    INSTAGRAM_ADS: { color: 'bg-pink-100 text-pink-800', icon: '📷', name: 'Instagram' },
    TIKTOK_ADS: { color: 'bg-black text-white', icon: '🎵', name: 'TikTok' },
    LINKEDIN_ADS: { color: 'bg-blue-100 text-blue-800', icon: '💼', name: 'LinkedIn' },
    TWITTER_ADS: { color: 'bg-blue-100 text-blue-800', icon: '🐦', name: 'Twitter' },
  };

  // Status colors
  const statusColors: Record<Campaign['status'], string> = {
    ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    PAUSED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    ENDED: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
    DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
  };

  // Filter and sort campaigns
  const filteredAndSortedCampaigns = useMemo(() => {
    let filtered = campaigns.filter(campaign => {
      const matchesSearch = campaign.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || campaign.status === statusFilter;
      const matchesPlatform = platformFilter === 'ALL' || campaign.platform === platformFilter;
      
      return matchesSearch && matchesStatus && matchesPlatform;
    });

    // Sort campaigns
    filtered.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];

      // Handle string values
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      // Handle number values
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      }

      // Handle string comparison
      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [campaigns, searchTerm, statusFilter, platformFilter, sortBy, sortOrder]);

  // Handle sort
  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortOrder('desc');
    }
  };

  // Handle status toggle
  const handleStatusToggle = (campaign: Campaign) => {
    if (!onStatusChange) return;
    
    const newStatus = campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    onStatusChange(campaign.id, newStatus);
  };

  // Table headers
  const headers = [
    { key: 'name' as SortKey, label: 'Campaign', sortable: true },
    { key: 'platform' as SortKey, label: 'Platform', sortable: true },
    { key: 'status' as SortKey, label: 'Status', sortable: true },
    { key: 'spend' as SortKey, label: 'Spend', sortable: true },
    { key: 'clicks' as SortKey, label: 'Clicks', sortable: true },
    { key: 'impressions' as SortKey, label: 'Impressions', sortable: true },
    { key: 'conversions' as SortKey, label: 'Conversions', sortable: true },
    { key: 'ctr' as SortKey, label: 'CTR', sortable: true },
    { key: 'cpc' as SortKey, label: 'CPC', sortable: true },
    { key: 'roas' as SortKey, label: 'ROAS', sortable: true },
  ];

  // Get unique platforms for filter
  const uniquePlatforms = Array.from(new Set(campaigns.map(c => c.platform)));

  if (loading) {
    return (
      <div className={clsx('bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700', className)}>
        <div className="animate-pulse p-6">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700', className)}>
      {/* Filters */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search campaigns..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as Campaign['status'] | 'ALL')}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused</option>
            <option value="ENDED">Ended</option>
            <option value="DRAFT">Draft</option>
          </select>

          {/* Platform Filter */}
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="ALL">All Platforms</option>
            {uniquePlatforms.map(platform => (
              <option key={platform} value={platform}>
                {platformInfo[platform]?.name || platform}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          {/* Header */}
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              {headers.map((header) => (
                <th
                  key={header.key}
                  className={clsx(
                    'px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider',
                    header.sortable && 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800'
                  )}
                  onClick={() => header.sortable && handleSort(header.key)}
                >
                  <div className="flex items-center space-x-1">
                    <span>{header.label}</span>
                    {header.sortable && (
                      <div className="flex flex-col">
                        <ChevronUpIcon 
                          className={clsx(
                            'h-3 w-3',
                            sortBy === header.key && sortOrder === 'asc' 
                              ? 'text-blue-500' 
                              : 'text-gray-300'
                          )} 
                        />
                        <ChevronDownIcon 
                          className={clsx(
                            'h-3 w-3 -mt-1',
                            sortBy === header.key && sortOrder === 'desc' 
                              ? 'text-blue-500' 
                              : 'text-gray-300'
                          )} 
                        />
                      </div>
                    )}
                  </div>
                </th>
              ))}
              {showActions && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>

          {/* Body */}
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {filteredAndSortedCampaigns.map((campaign, index) => (
              <motion.tr
                key={campaign.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className={clsx(
                  'hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors',
                  onCampaignClick && 'cursor-pointer'
                )}
                onClick={() => onCampaignClick && onCampaignClick(campaign)}
              >
                {/* Campaign Name */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {campaign.name}
                    </div>
                    {campaign.objective && (
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {campaign.objective}
                      </div>
                    )}
                  </div>
                </td>

                {/* Platform */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">
                      {platformInfo[campaign.platform]?.icon || '📊'}
                    </span>
                    <span className={clsx(
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                      platformInfo[campaign.platform]?.color || 'bg-gray-100 text-gray-800'
                    )}>
                      {platformInfo[campaign.platform]?.name || campaign.platform}
                    </span>
                  </div>
                </td>

                {/* Status */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={clsx(
                    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                    statusColors[campaign.status]
                  )}>
                    {campaign.status}
                  </span>
                </td>

                {/* Spend */}
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {formatCurrency(campaign.spend)}
                </td>

                {/* Clicks */}
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {formatNumber(campaign.clicks)}
                </td>

                {/* Impressions */}
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {formatNumber(campaign.impressions)}
                </td>

                {/* Conversions */}
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {formatNumber(campaign.conversions)}
                </td>

                {/* CTR */}
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {formatPercentage(campaign.ctr)}
                </td>

                {/* CPC */}
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {formatCurrency(campaign.cpc)}
                </td>

                {/* ROAS */}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <span className={clsx(
                      'text-sm font-medium',
                      campaign.roas >= 2 
                        ? 'text-green-600 dark:text-green-400' 
                        : campaign.roas >= 1 
                        ? 'text-yellow-600 dark:text-yellow-400'
                        : 'text-red-600 dark:text-red-400'
                    )}>
                      {campaign.roas.toFixed(2)}
                    </span>
                  </div>
                </td>

                {/* Actions */}
                {showActions && (
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      {/* Status Toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStatusToggle(campaign);
                        }}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title={campaign.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                      >
                        {campaign.status === 'ACTIVE' ? (
                          <PauseIcon className="h-4 w-4" />
                        ) : (
                          <PlayIcon className="h-4 w-4" />
                        )}
                      </button>

                      {/* More Actions Menu */}
                      <Menu as="div" className="relative">
                        <Menu.Button 
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <EllipsisVerticalIcon className="h-4 w-4" />
                        </Menu.Button>

                        <Transition
                          enter="transition ease-out duration-100"
                          enterFrom="transform opacity-0 scale-95"
                          enterTo="transform opacity-100 scale-100"
                          leave="transition ease-in duration-75"
                          leaveFrom="transform opacity-100 scale-100"
                          leaveTo="transform opacity-0 scale-95"
                        >
                          <Menu.Items className="absolute right-0 z-10 mt-2 w-48 bg-white dark:bg-gray-700 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                            <div className="py-1">
                              <Menu.Item>
                                {({ active }) => (
                                  <button
                                    className={clsx(
                                      'flex items-center w-full px-4 py-2 text-sm',
                                      active 
                                        ? 'bg-gray-100 dark:bg-gray-600 text-gray-900 dark:text-white' 
                                        : 'text-gray-700 dark:text-gray-300'
                                    )}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onEdit && onEdit(campaign);
                                    }}
                                  >
                                    <PencilIcon className="h-4 w-4 mr-2" />
                                    Edit
                                  </button>
                                )}
                              </Menu.Item>

                              <Menu.Item>
                                {({ active }) => (
                                  <button
                                    className={clsx(
                                      'flex items-center w-full px-4 py-2 text-sm',
                                      active 
                                        ? 'bg-gray-100 dark:bg-gray-600 text-gray-900 dark:text-white' 
                                        : 'text-gray-700 dark:text-gray-300'
                                    )}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDuplicate && onDuplicate(campaign);
                                    }}
                                  >
                                    <DocumentDuplicateIcon className="h-4 w-4 mr-2" />
                                    Duplicate
                                  </button>
                                )}
                              </Menu.Item>

                              <Menu.Item>
                                {({ active }) => (
                                  <button
                                    className={clsx(
                                      'flex items-center w-full px-4 py-2 text-sm',
                                      active 
                                        ? 'bg-gray-100 dark:bg-gray-600 text-gray-900 dark:text-white' 
                                        : 'text-gray-700 dark:text-gray-300'
                                    )}
                                  >
                                    <ChartBarIcon className="h-4 w-4 mr-2" />
                                    Analytics
                                  </button>
                                )}
                              </Menu.Item>

                              <Menu.Item>
                                {({ active }) => (
                                  <button
                                    className={clsx(
                                      'flex items-center w-full px-4 py-2 text-sm',
                                      active 
                                        ? 'bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-300' 
                                        : 'text-red-700 dark:text-red-400'
                                    )}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDelete && onDelete(campaign.id);
                                    }}
                                  >
                                    <TrashIcon className="h-4 w-4 mr-2" />
                                    Delete
                                  </button>
                                )}
                              </Menu.Item>
                            </div>
                          </Menu.Items>
                        </Transition>
                      </Menu>
                    </div>
                  </td>
                )}
              </motion.tr>
            ))}
          </tbody>
        </table>

        {/* Empty State */}
        {filteredAndSortedCampaigns.length === 0 && (
          <div className="text-center py-12">
            <ChartBarIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
              No campaigns found
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {searchTerm || statusFilter !== 'ALL' || platformFilter !== 'ALL'
                ? 'Try adjusting your filters'
                : 'Get started by creating your first campaign'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CampaignTable;