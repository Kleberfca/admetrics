import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X, Bell, Search, Settings, LogOut, User, ChevronDown } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { useTheme } from '../../../hooks/useTheme';
import { useNotifications } from '../../../hooks/useNotifications';
import { Dropdown } from '../Dropdown';
import { NotificationPanel } from '../NotificationPanel';
import { SearchModal } from '../SearchModal';
import { Avatar } from '../Avatar';
import { Badge } from '../Badge';
import { Button } from '../Button';

interface HeaderProps {
  onMenuToggle: () => void;
  isSidebarOpen: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onMenuToggle, isSidebarOpen }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { notifications, unreadCount, markAsRead } = useNotifications();
  
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const handleLogout = async () => {
    await logout();
  };

  const userMenuItems = [
    {
      label: 'Profile',
      icon: <User className="w-4 h-4" />,
      href: '/profile',
    },
    {
      label: 'Settings',
      icon: <Settings className="w-4 h-4" />,
      href: '/settings',
    },
    {
      label: 'Logout',
      icon: <LogOut className="w-4 h-4" />,
      onClick: handleLogout,
    },
  ];

  return (
    <>
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left section */}
            <div className="flex items-center">
              <button
                onClick={onMenuToggle}
                className="p-2 rounded-md text-gray-500 hover:text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              >
                {isSidebarOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <Menu className="h-6 w-6" />
                )}
              </button>

              <div className="hidden md:block ml-6">
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                  AdMetrics AI Dashboard
                </h1>
              </div>
            </div>

            {/* Right section */}
            <div className="flex items-center space-x-4">
              {/* Search button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSearch(true)}
                className="hidden sm:flex"
              >
                <Search className="h-5 w-5" />
              </Button>

              {/* Theme toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleTheme}
                className="hidden sm:flex"
              >
                {theme === 'dark' ? '🌞' : '🌙'}
              </Button>

              {/* Notifications */}
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative"
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <Badge
                      variant="danger"
                      size="sm"
                      className="absolute -top-1 -right-1"
                    >
                      {unreadCount}
                    </Badge>
                  )}
                </Button>

                {showNotifications && (
                  <NotificationPanel
                    notifications={notifications}
                    onClose={() => setShowNotifications(false)}
                    onMarkAsRead={markAsRead}
                  />
                )}
              </div>

              {/* User menu */}
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center space-x-3 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                >
                  <Avatar
                    src={user?.profileImage}
                    alt={user?.firstName || 'User'}
                    size="sm"
                  />
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {user?.email}
                    </p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-gray-500" />
                </button>

                {showUserMenu && (
                  <Dropdown
                    items={userMenuItems}
                    onClose={() => setShowUserMenu(false)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Search modal */}
      {showSearch && (
        <SearchModal onClose={() => setShowSearch(false)} />
      )}
    </>
  );
};