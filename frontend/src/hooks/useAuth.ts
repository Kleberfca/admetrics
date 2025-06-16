import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useCallback } from 'react';
import { toast } from 'react-toastify';

interface UseAuthReturn {
  user: any;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  register: (data: any) => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isLoading = status === 'loading';
  const isAuthenticated = status === 'authenticated';

  const login = useCallback(async (credentials: { email: string; password: string }) => {
    try {
      const result = await signIn('credentials', {
        redirect: false,
        ...credentials
      });

      if (result?.error) {
        toast.error('Invalid email or password');
        throw new Error(result.error);
      }

      toast.success('Welcome back!');
      router.push('/dashboard');
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }, [router]);

  const logout = useCallback(async () => {
    try {
      await signOut({ redirect: false });
      toast.info('You have been logged out');
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Failed to logout');
    }
  }, [router]);

  const register = useCallback(async (data: any) => {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Registration failed');
      }

      toast.success('Registration successful! Please login.');
      router.push('/login');
    } catch (error: any) {
      console.error('Registration error:', error);
      toast.error(error.message || 'Registration failed');
      throw error;
    }
  }, [router]);

  return {
    user: session?.user || null,
    isLoading,
    isAuthenticated,
    login,
    logout,
    register
  };
}