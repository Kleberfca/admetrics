import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Megaphone, 
  BarChart3, 
  Link2, 
  FileText, 
  Brain, 
  Settings,
  HelpCircle,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { useAuth } from '../../../hooks/useAuth';
import { Tooltip } from '../Tooltip';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: number | string;
  permission?: string;
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Campaigns', href: '/campaigns', icon: Megaphone },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Integrations', href: '/integrations', icon: Link2 },
  { name: 'Reports', href: '/reports', icon: FileText },
  { name: 'AI Insights', href: '/ai-insights', icon: Brain },
];

const bottomNavigation: NavItem[] = [
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Help & Support', href: '/support', icon: HelpCircle },
];

export const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen, 
  onClose, 
  isCollapsed, 
  onToggleCollapse 
}) => {
  const location = useLocation();
  const { user, hasPermission } = useAuth();

  const NavItem = ({ item }: { item: NavItem }) => {
    const isActive = location.pathname === item.href || 
                    location.pathname.startsWith(`${item.href}/`);

    // Check permissions
    if (item.permission && !hasPermission(item.permission)) {
      return null;
    }

    const content = (
      <NavLink
        to={item.href}
        className={cn(
          'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors duration-150',
          isActive
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800',
          isCollapsed && 'justify-center'
        )}
      >
        <item.icon
          className={cn(
            'flex-shrink-0 h-5 w-5',
            isActive ? 'text-blue-700 dark:text-blue-300' : 'text-gray-400',
            !isCollapsed && 'mr-3'
          )}
        />
        {!isCollapsed && (
          <>
            <span className="flex-1">{item.name}</span>
            {item.badge && (
              <span className="ml-auto bg-blue-100 text-blue-600 py-0.5 px-2 text-xs rounded-full">
                {item.badge}
              </span>
            )}
          </>
        )}
      </NavLink>
    );

    if (isCollapsed) {
      return (
        <Tooltip content={item.name} side="right">
          {content}
        </Tooltip>
      );
    }

    return content;
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && !isCollapsed && (
        <div
          className="fixed inset-0 bg-gray-600 bg-opacity-75 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 transition-all duration-300',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0 lg:static lg:inset-0',
          isCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
          {!isCollapsed && (
            <div className="flex items-center">
              <img
                className="h-8 w-auto"
                src="/logo.svg"
                alt="AdMetrics"
              />
              <span className="ml-2 text-xl font-bold text-gray-900 dark:text-white">
                AdMetrics
              </span>
            </div>
          )}
          
          <div className="flex items-center">
            <button
              onClick={onToggleCollapse}
              className="hidden lg:block p-1 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {isCollapsed ? (
                <ChevronRight className="h-5 w-5" />
              ) : (
                <ChevronLeft className="h-5 w-5" />
              )}
            </button>
            
            <button
              onClick={onClose}
              className="lg:hidden p-1 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => (
            <NavItem key={item.name} item={item} />
          ))}
        </nav>

        {/* Bottom navigation */}
        <div className="px-3 py-4 space-y-1 border-t border-gray-200 dark:border-gray-700">
          {bottomNavigation.map((item) => (
            <NavItem key={item.name} item={item} />
          ))}
        </div>

        {/* User info */}
        {!isCollapsed && user && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <img
                className="h-8 w-8 rounded-full"
                src={user.profileImage || `https://ui-avatars.com/api/?name=${user.firstName}+${user.lastName}`}
                alt={user.firstName}
              />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {user.role}
                </p>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};