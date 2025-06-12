// frontend/src/hooks/useAuth.ts
import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiService } from '../services/api.service';
import { useAuthStore } from '../store/auth.store';
import type { LoginCredentials, RegisterData, User } from '../types/auth.types';

interface UseAuthReturn {
  // State
  isLoading: boolean;
  isAuthenticated: boolean;
  user: User | null;
  
  // Actions
  login: (credentials: LoginCredentials) => Promise<boolean>;
  register: (data: RegisterData) => Promise<boolean>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<boolean>;
  resetPassword: (token: string, password: string) => Promise<boolean>;
  updateProfile: (data: Partial<User>) => Promise<boolean>;
  refreshProfile: () => Promise<void>;
  initialize: () => Promise<void>;
  
  // Utilities
  hasRole: (role: string) => boolean;
  hasPermission: (permission: string) => boolean;
}

export const useAuth = (): UseAuthReturn => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  
  const {
    user,
    isAuthenticated,
    setUser,
    setTokens,
    clearAuth,
    isInitialized,
    setInitialized
  } = useAuthStore();

  /**
   * Initialize authentication state from storage
   */
  const initialize = useCallback(async () => {
    if (isInitialized) return;

    setIsLoading(true);
    
    try {
      const token = localStorage.getItem('token');
      const refreshToken = localStorage.getItem('refreshToken');
      
      if (token && refreshToken) {
        // Validate token by fetching user profile
        const userData = await apiService.getProfile();
        setUser(userData);
        setTokens(token, refreshToken);
      }
    } catch (error) {
      // Token invalid, clear auth data
      clearAuth();
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
    } finally {
      setInitialized(true);
      setIsLoading(false);
    }
  }, [isInitialized, setUser, setTokens, clearAuth, setInitialized]);

  /**
   * Login user
   */
  const login = useCallback(async (credentials: LoginCredentials): Promise<boolean> => {
    setIsLoading(true);
    
    try {
      const response = await apiService.login(credentials);
      
      if (response.success && response.user && response.token && response.refreshToken) {
        // Store tokens
        localStorage.setItem('token', response.token);
        localStorage.setItem('refreshToken', response.refreshToken);
        
        // Update auth state
        setUser(response.user);
        setTokens(response.token, response.refreshToken);
        
        toast.success(response.message || 'Login successful!');
        
        // Navigate to dashboard
        navigate('/dashboard', { replace: true });
        
        return true;
      } else {
        toast.error(response.message || 'Login failed');
        return false;
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Login failed. Please try again.';
      toast.error(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [navigate, setUser, setTokens]);

  /**
   * Register new user
   */
  const register = useCallback(async (data: RegisterData): Promise<boolean> => {
    setIsLoading(true);
    
    try {
      const response = await apiService.register(data);
      
      if (response.success && response.user && response.token && response.refreshToken) {
        // Store tokens
        localStorage.setItem('token', response.token);
        localStorage.setItem('refreshToken', response.refreshToken);
        
        // Update auth state
        setUser(response.user);
        setTokens(response.token, response.refreshToken);
        
        toast.success(response.message || 'Account created successfully!');
        
        // Navigate to dashboard
        navigate('/dashboard', { replace: true });
        
        return true;
      } else {
        toast.error(response.message || 'Registration failed');
        return false;
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Registration failed. Please try again.';
      toast.error(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [navigate, setUser, setTokens]);

  /**
   * Logout user
   */
  const logout = useCallback(async () => {
    setIsLoading(true);
    
    try {
      await apiService.logout();
    } catch (error) {
      // Continue with logout even if API call fails
      console.warn('Logout API call failed:', error);
    } finally {
      // Clear auth state and storage
      clearAuth();
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      
      toast.success('Logged out successfully');
      
      // Navigate to login
      navigate('/auth/login', { replace: true });
      
      setIsLoading(false);
    }
  }, [navigate, clearAuth]);

  /**
   * Send forgot password email
   */
  const forgotPassword = useCallback(async (email: string): Promise<boolean> => {
    setIsLoading(true);
    
    try {
      const response = await apiService.forgotPassword(email);
      
      if (response.success) {
        toast.success(response.message || 'Password reset email sent!');
        return true;
      } else {
        toast.error(response.message || 'Failed to send reset email');
        return false;
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Failed to send reset email';
      toast.error(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Reset password with token
   */
  const resetPassword = useCallback(async (token: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    
    try {
      const response = await apiService.resetPassword(token, password);
      
      if (response.success) {
        toast.success(response.message || 'Password reset successfully!');
        
        // Navigate to login
        navigate('/auth/login', { replace: true });
        
        return true;
      } else {
        toast.error(response.message || 'Failed to reset password');
        return false;
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Failed to reset password';
      toast.error(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  /**
   * Update user profile
   */
  const updateProfile = useCallback(async (data: Partial<User>): Promise<boolean> => {
    setIsLoading(true);
    
    try {
      const updatedUser = await apiService.updateProfile(data);
      
      // Update auth state
      setUser(updatedUser);
      
      toast.success('Profile updated successfully!');
      return true;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Failed to update profile';
      toast.error(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [setUser]);

  /**
   * Refresh user profile data
   */
  const refreshProfile = useCallback(async () => {
    if (!isAuthenticated) return;
    
    try {
      const userData = await apiService.getProfile();
      setUser(userData);
    } catch (error) {
      console.error('Failed to refresh profile:', error);
      // Don't show error toast for this operation
    }
  }, [isAuthenticated, setUser]);

  /**
   * Check if user has specific role
   */
  const hasRole = useCallback((role: string): boolean => {
    if (!user) return false;
    return user.role === role || user.role === 'ADMIN'; // Admin has all roles
  }, [user]);

  /**
   * Check if user has specific permission
   */
  const hasPermission = useCallback((permission: string): boolean => {
    if (!user) return false;
    
    // Admin has all permissions
    if (user.role === 'ADMIN') return true;
    
    // Check user permissions (if implemented)
    // This would need to be expanded based on your permission system
    const userPermissions = user.permissions || [];
    return userPermissions.includes(permission);
  }, [user]);

  // Auto-initialize on mount
  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [initialize, isInitialized]);

  // Auto-refresh profile data periodically
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const interval = setInterval(() => {
      refreshProfile();
    }, 5 * 60 * 1000); // Refresh every 5 minutes

    return () => clearInterval(interval);
  }, [isAuthenticated, user, refreshProfile]);

  // Listen for storage changes (e.g., logout in another tab)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'token' && !e.newValue && isAuthenticated) {
        // Token was removed in another tab
        clearAuth();
        navigate('/auth/login', { replace: true });
        toast.info('You have been logged out');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [isAuthenticated, clearAuth, navigate]);

  // Listen for online/offline status
  useEffect(() => {
    const handleOnline = () => {
      if (isAuthenticated) {
        refreshProfile();
        toast.success('Connection restored');
      }
    };

    const handleOffline = () => {
      toast.error('Connection lost. Some features may not work.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isAuthenticated, refreshProfile]);

  return {
    // State
    isLoading,
    isAuthenticated,
    user,
    
    // Actions
    login,
    register,
    logout,
    forgotPassword,
    resetPassword,
    updateProfile,
    refreshProfile,
    initialize,
    
    // Utilities
    hasRole,
    hasPermission
  };
};

export default useAuth;