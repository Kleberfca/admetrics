// frontend/src/components/layout/Layout.tsx
import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bars3Icon,
  BellIcon,
  MagnifyingGlassIcon,
  UserCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon
} from '@heroicons/react/24/outline';

// Components
import Sidebar from './Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { useAuthStore } from '../../store/auth.store';
import { formatRelativeTime } from '../../utils/formatters';

interface LayoutProps {
  children?: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { logout } = useAuth();

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuOpen) {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileMenuOpen]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content area */}
      <div className="lg:pl-64">
        {/* Top navigation */}
        <div className="sticky top-0 z-40 bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
            {/* Left side */}
            <div className="flex items-center">
              {/* Mobile menu button */}
              <button
                type="button"
                className="lg:hidden -ml-0.5 -mt-0.5 h-12 w-12 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                onClick={() => setSidebarOpen(true)}
              >
                <span className="sr-only">Open sidebar</span>
                <Bars3Icon className="h-6 w-6" />
              </button>

              {/* Search */}
              <div className="hidden sm:block ml-4">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search campaigns, metrics..."
                    className="block w-64 pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Right side */}
            <div className="flex items-center space-x-4">
              {/* Notifications */}
              <button
                type="button"
                className="bg-white p-1 rounded-full text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <span className="sr-only">View notifications</span>
                <div className="relative">
                  <BellIcon className="h-6 w-6" />
                  {/* Notification badge */}
                  <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full"></span>
                </div>
              </button>

              {/* Profile dropdown */}
              <div className="relative">
                <button
                  type="button"
                  className="bg-white rounded-full flex text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                >
                  <span className="sr-only">Open user menu</span>
                  {user?.avatar ? (
                    <img
                      className="h-8 w-8 rounded-full"
                      src={user.avatar}
                      alt={user.name || 'User'}
                    />
                  ) : (
                    <UserCircleIcon className="h-8 w-8 text-gray-400" />
                  )}
                </button>

                {/* Profile dropdown menu */}
                <AnimatePresence>
                  {profileMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.1 }}
                      className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none"
                    >
                      <div className="py-1">
                        {/* User info */}
                        <div className="px-4 py-3 border-b border-gray-200">
                          <p className="text-sm font-medium text-gray-900">
                            {user?.name || 'User'}
                          </p>
                          <p className="text-sm text-gray-500">{user?.email}</p>
                          {user?.lastLoginAt && (
                            <p className="text-xs text-gray-400 mt-1">
                              Last login: {formatRelativeTime(user.lastLoginAt)}
                            </p>
                          )}
                        </div>

                        {/* Menu items */}
                        <button
                          onClick={() => {
                            navigate('/profile');
                            setProfileMenuOpen(false);
                          }}
                          className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <UserCircleIcon className="h-4 w-4 mr-3 text-gray-400" />
                          Profile
                        </button>

                        <button
                          onClick={() => {
                            navigate('/settings');
                            setProfileMenuOpen(false);
                          }}
                          className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <Cog6ToothIcon className="h-4 w-4 mr-3 text-gray-400" />
                          Settings
                        </button>

                        <div className="border-t border-gray-200">
                          <button
                            onClick={handleLogout}
                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          >
                            <ArrowRightOnRectangleIcon className="h-4 w-4 mr-3 text-gray-400" />
                            Sign out
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
};

export default Layout;

// ---

// frontend/src/components/layout/Sidebar.tsx
import React, { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  XMarkIcon,
  HomeIcon,
  ChartBarIcon,
  MegaphoneIcon,
  DocumentChartBarIcon,
  Cog6ToothIcon,
  LightBulbIcon,
  PuzzlePieceIcon,
  BellIcon
} from '@heroicons/react/24/outline';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Campaigns', href: '/campaigns', icon: MegaphoneIcon },
  { name: 'Analytics', href: '/analytics', icon: ChartBarIcon },
  { name: 'AI Insights', href: '/ai-insights', icon: LightBulbIcon },
  { name: 'Reports', href: '/reports', icon: DocumentChartBarIcon },
  { name: 'Integrations', href: '/integrations', icon: PuzzlePieceIcon },
  { name: 'Alerts', href: '/alerts', icon: BellIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
];

const Sidebar: React.FC<SidebarProps> = ({ open, onClose }) => {
  const location = useLocation();

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">AM</span>
            </div>
          </div>
          <div className="ml-3">
            <h1 className="text-lg font-semibold text-gray-900">AdMetrics</h1>
            <p className="text-xs text-gray-500">AI Dashboard</p>
          </div>
        </div>
        
        {/* Close button for mobile */}
        <button
          type="button"
          className="lg:hidden -mr-2 h-8 w-8 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
          onClick={onClose}
        >
          <span className="sr-only">Close sidebar</span>
          <XMarkIcon className="h-6 w-6" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href || 
                          (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
          
          return (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) => `
                group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors
                ${isActive
                  ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                }
              `}
              onClick={onClose} // Close mobile sidebar on navigation
            >
              <item.icon
                className={`mr-3 h-5 w-5 flex-shrink-0 ${
                  isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'
                }`}
              />
              {item.name}
              
              {/* Badge for notifications */}
              {item.name === 'Alerts' && (
                <span className="ml-auto bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  3
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-200">
        <div className="text-xs text-gray-500">
          <p>Version 1.0.0</p>
          <p className="mt-1">© 2024 AdMetrics AI</p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile sidebar */}
      <Transition.Root show={open} as={Fragment}>
        <Dialog as="div" className="relative z-50 lg:hidden" onClose={onClose}>
          <Transition.Child
            as={Fragment}
            enter="transition-opacity ease-linear duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-linear duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-900/80" />
          </Transition.Child>

          <div className="fixed inset-0 flex">
            <Transition.Child
              as={Fragment}
              enter="transition ease-in-out duration-300 transform"
              enterFrom="-translate-x-full"
              enterTo="translate-x-0"
              leave="transition ease-in-out duration-300 transform"
              leaveFrom="translate-x-0"
              leaveTo="-translate-x-full"
            >
              <Dialog.Panel className="relative mr-16 flex w-full max-w-xs flex-1">
                <div className="flex min-h-0 flex-1 flex-col bg-white">
                  <SidebarContent />
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition.Root>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col">
        <div className="flex min-h-0 flex-1 flex-col bg-white border-r border-gray-200">
          <SidebarContent />
        </div>
      </div>
    </>
  );
};

export default Sidebar;

// ---

// frontend/src/components/layout/AuthLayout.tsx
import React from 'react';
import { motion } from 'framer-motion';

interface AuthLayoutProps {
  children: React.ReactNode;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:px-8 bg-gradient-to-br from-blue-600 to-purple-700">
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="text-white"
        >
          <div className="mb-8">
            <div className="flex items-center mb-4">
              <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <span className="text-white font-bold text-xl">AM</span>
              </div>
              <div className="ml-4">
                <h1 className="text-3xl font-bold">AdMetrics</h1>
                <p className="text-blue-100">AI-Powered Dashboard</p>
              </div>
            </div>
          </div>

          <div className="max-w-md">
            <h2 className="text-4xl font-bold mb-6">
              Intelligent Advertising Analytics
            </h2>
            <p className="text-xl text-blue-100 mb-8">
              Centralize your campaign data, optimize with AI, and maximize your ROI across all platforms.
            </p>

            <div className="space-y-4">
              <div className="flex items-center">
                <div className="h-2 w-2 bg-blue-300 rounded-full mr-3"></div>
                <span className="text-blue-100">Multi-platform integration</span>
              </div>
              <div className="flex items-center">
                <div className="h-2 w-2 bg-blue-300 rounded-full mr-3"></div>
                <span className="text-blue-100">AI-powered insights</span>
              </div>
              <div className="flex items-center">
                <div className="h-2 w-2 bg-blue-300 rounded-full mr-3"></div>
                <span className="text-blue-100">Real-time optimization</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Right side - Auth forms */}
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-8 bg-white">
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="w-full max-w-md mx-auto"
        >
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 text-center">
            <div className="inline-flex items-center">
              <div className="h-10 w-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">AM</span>
              </div>
              <div className="ml-3">
                <h1 className="text-2xl font-bold text-gray-900">AdMetrics</h1>
                <p className="text-sm text-gray-500">AI Dashboard</p>
              </div>
            </div>
          </div>

          {children}
        </motion.div>
      </div>
    </div>
  );
};

export default AuthLayout;