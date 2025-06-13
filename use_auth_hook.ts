import { useState, useEffect, useCallback, useContext, createContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api.service';
import toast from 'react-hot-toast';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar?: string;
  preferences?: any;
  organizationId?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  refreshUser: () => Promise<void>;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  const isAuthenticated = !!user;

  // Check if user is authenticated on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setIsLoading(false);
        return;
      }

      const userData = await apiService.getCurrentUser();
      setUser(userData);
    } catch (error) {
      localStorage.removeItem('auth_token');
      console.error('Auth check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = useCallback(async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const { user: userData, token } = await apiService.login({ email, password });
      
      setUser(userData);
      localStorage.setItem('auth_token', token);
      
      // Navigate to dashboard or intended page
      const intendedPath = sessionStorage.getItem('intended_path') || '/dashboard';
      sessionStorage.removeItem('intended_path');
      navigate(intendedPath);
      
    } catch (error: any) {
      throw error; // Re-throw to be handled by the component
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  const register = useCallback(async (data: RegisterData) => {
    try {
      setIsLoading(true);
      
      if (data.password !== data.confirmPassword) {
        throw new Error('Passwords do not match');
      }

      const { user: userData, token } = await apiService.register(data);
      
      setUser(userData);
      localStorage.setItem('auth_token', token);
      
      navigate('/dashboard');
      
    } catch (error: any) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  const logout = useCallback(async () => {
    try {
      setIsLoading(true);
      await apiService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      localStorage.removeItem('auth_token');
      setIsLoading(false);
      navigate('/login');
    }
  }, [navigate]);

  const updateProfile = useCallback(async (data: Partial<User>) => {
    try {
      const updatedUser = await apiService.updateProfile(data);
      setUser(prev => prev ? { ...prev, ...updatedUser } : null);
    } catch (error) {
      throw error;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const userData = await apiService.getCurrentUser();
      setUser(userData);
    } catch (error) {
      console.error('Failed to refresh user data:', error);
    }
  }, []);

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    updateProfile,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Additional hooks for specific auth scenarios

export const useRequireAuth = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Store the intended path before redirecting
      sessionStorage.setItem('intended_path', window.location.pathname);
      navigate('/login');
    }
  }, [isAuthenticated, isLoading, navigate]);

  return { isAuthenticated, isLoading };
};

export const useAuthRedirect = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, isLoading, navigate]);

  return { isAuthenticated, isLoading };
};

// Hook for role-based access control
export const useRole = (requiredRoles: string | string[]) => {
  const { user, isAuthenticated } = useAuth();
  
  const allowedRoles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
  const hasRole = user && allowedRoles.includes(user.role);
  
  return {
    hasRole: !!hasRole,
    userRole: user?.role,
    isAuthenticated,
  };
};

// Hook for handling authentication errors and token refresh
export const useTokenRefresh = () => {
  const { logout } = useAuth();

  const handleTokenRefresh = useCallback(async () => {
    try {
      const newToken = await apiService.refreshToken();
      localStorage.setItem('auth_token', newToken);
      return true;
    } catch (error) {
      console.error('Token refresh failed:', error);
      toast.error('Session expired. Please login again.');
      await logout();
      return false;
    }
  }, [logout]);

  return { handleTokenRefresh };
};

// Hook for managing user sessions
export const useSession = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const [sessionWarning, setSessionWarning] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Check for session expiry warning (e.g., 5 minutes before expiry)
    const checkSessionExpiry = () => {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      try {
        // Decode JWT to check expiry (simplified - in production use a proper JWT library)
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expiryTime = payload.exp * 1000;
        const currentTime = Date.now();
        const timeUntilExpiry = expiryTime - currentTime;

        // Show warning 5 minutes before expiry
        if (timeUntilExpiry <= 5 * 60 * 1000 && timeUntilExpiry > 0) {
          setSessionWarning(true);
        }

        // Auto-logout if expired
        if (timeUntilExpiry <= 0) {
          toast.error('Session expired');
          logout();
        }
      } catch (error) {
        console.error('Error checking session expiry:', error);
      }
    };

    // Check every minute
    const interval = setInterval(checkSessionExpiry, 60000);
    
    // Check immediately
    checkSessionExpiry();

    return () => clearInterval(interval);
  }, [isAuthenticated, logout]);

  const extendSession = useCallback(async () => {
    try {
      await apiService.refreshToken();
      setSessionWarning(false);
      toast.success('Session extended');
    } catch (error) {
      console.error('Failed to extend session:', error);
      toast.error('Failed to extend session');
    }
  }, []);

  const dismissSessionWarning = useCallback(() => {
    setSessionWarning(false);
  }, []);

  return {
    sessionWarning,
    extendSession,
    dismissSessionWarning,
    user,
    isAuthenticated,
  };
};

export default useAuth;