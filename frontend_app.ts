import React, { Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'react-hot-toast';
import { HelmetProvider } from 'react-helmet-async';

// Store
import { useAuthStore } from './store/auth.store';
import { useDashboardStore } from './store/dashboard.store';

// Components
import LoadingSpinner from './components/common/LoadingSpinner';
import ErrorBoundary from './components/common/ErrorBoundary';
import Layout from './components/layout/Layout';
import AuthLayout from './components/layout/AuthLayout';

// Pages
import Dashboard from './pages/Dashboard';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import Campaigns from './pages/Campaigns';
import Analytics from './pages/Analytics';
import Integrations from './pages/Integrations';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import AIInsights from './pages/AIInsights';

// Hooks
import { useWebSocket } from './hooks/useWebSocket';
import { useAuth } from './hooks/useAuth';

// Services
import { apiService } from './services/api.service';

// Styles
import './styles/globals.css';

// React Query configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      retry: (failureCount, error: any) => {
        if (error?.response?.status === 401) return false;
        return failureCount < 3;
      },
      refetchOnWindowFocus: false,
      refetchOnMount: true,
    },
    mutations: {
      retry: false,
    },
  },
});

// Protected Route Component
interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  return <>{children}</>;
};

// Public Route Component (redirect if authenticated)
const PublicRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

// Main App Component
const App: React.FC = () => {
  const { initialize } = useAuth();
  const { initializeDashboard } = useDashboardStore();
  const { isAuthenticated } = useAuthStore();

  // Initialize WebSocket connection for authenticated users
  useWebSocket({
    enabled: isAuthenticated,
    url: process.env.REACT_APP_WS_URL || 'ws://localhost:3000',
  });

  // Initialize application
  useEffect(() => {
    const initApp = async () => {
      try {
        // Initialize authentication
        await initialize();
        
        // Set up API interceptors
        apiService.setupInterceptors();
        
        // Initialize dashboard if user is authenticated
        if (isAuthenticated) {
          await initializeDashboard();
        }
      } catch (error) {
        console.error('Failed to initialize app:', error);
      }
    };

    initApp();
  }, [initialize, initializeDashboard, isAuthenticated]);

  return (
    <ErrorBoundary>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <Router>
            <div className="App">
              <Suspense
                fallback={
                  <div className="min-h-screen flex items-center justify-center bg-gray-50">
                    <LoadingSpinner size="lg" />
                  </div>
                }
              >
                <Routes>
                  {/* Public Routes */}
                  <Route
                    path="/auth/login"
                    element={
                      <PublicRoute>
                        <AuthLayout>
                          <Login />
                        </AuthLayout>
                      </PublicRoute>
                    }
                  />
                  <Route
                    path="/auth/register"
                    element={
                      <PublicRoute>
                        <AuthLayout>
                          <Register />
                        </AuthLayout>
                      </PublicRoute>
                    }
                  />
                  <Route
                    path="/auth/forgot-password"
                    element={
                      <PublicRoute>
                        <AuthLayout>
                          <ForgotPassword />
                        </AuthLayout>
                      </PublicRoute>
                    }
                  />
                  <Route
                    path="/auth/reset-password"
                    element={
                      <PublicRoute>
                        <AuthLayout>
                          <ResetPassword />
                        </AuthLayout>
                      </PublicRoute>
                    }
                  />

                  {/* Protected Routes */}
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <Dashboard />
                        </Layout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/campaigns"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <Campaigns />
                        </Layout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/analytics"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <Analytics />
                        </Layout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/integrations"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <Integrations />
                        </Layout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reports"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <Reports />
                        </Layout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/ai-insights"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <AIInsights />
                        </Layout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <Settings />
                        </Layout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/profile"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <Profile />
                        </Layout>
                      </ProtectedRoute>
                    }
                  />

                  {/* Default redirects */}
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/auth" element={<Navigate to="/auth/login" replace />} />
                  
                  {/* 404 Page */}
                  <Route
                    path="*"
                    element={
                      <div className="min-h-screen flex items-center justify-center bg-gray-50">
                        <div className="text-center">
                          <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>
                          <h2 className="text-2xl font-semibold text-gray-700 mb-4">
                            Page Not Found
                          </h2>
                          <p className="text-gray-600 mb-8">
                            The page you're looking for doesn't exist.
                          </p>
                          <button
                            onClick={() => window.history.back()}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          >
                            Go Back
                          </button>
                        </div>
                      </div>
                    }
                  />
                </Routes>
              </Suspense>

              {/* Global Toast Notifications */}
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: '#363636',
                    color: '#fff',
                  },
                  success: {
                    duration: 3000,
                    iconTheme: {
                      primary: '#10B981',
                      secondary: '#fff',
                    },
                  },
                  error: {
                    duration: 5000,
                    iconTheme: {
                      primary: '#EF4444',
                      secondary: '#fff',
                    },
                  },
                }}
              />

              {/* React Query DevTools (only in development) */}
              {process.env.NODE_ENV === 'development' && (
                <ReactQueryDevtools initialIsOpen={false} />
              )}
            </div>
          </Router>
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
};

export default App;