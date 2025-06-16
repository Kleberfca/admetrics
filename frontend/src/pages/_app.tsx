import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { SessionProvider } from 'next-auth/react';
import { Provider } from 'react-redux';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { store } from '@/store';
import { theme } from '@/styles/theme';
import { Layout } from '@/components/Layout';
import { AuthGuard } from '@/components/AuthGuard';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SocketProvider } from '@/contexts/SocketContext';
import { NotificationProvider } from '@/contexts/NotificationContext';

// Import global styles
import 'chartjs-adapter-date-fns';

function MyApp({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  // Check if the page requires authentication
  const requireAuth = (Component as any).requireAuth !== false;

  return (
    <ErrorBoundary>
      <SessionProvider session={session}>
        <Provider store={store}>
          <ThemeProvider theme={theme}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <CssBaseline />
              <SocketProvider>
                <NotificationProvider>
                  {requireAuth ? (
                    <AuthGuard>
                      <Layout>
                        <Component {...pageProps} />
                      </Layout>
                    </AuthGuard>
                  ) : (
                    <Component {...pageProps} />
                  )}
                  <ToastContainer
                    position="top-right"
                    autoClose={5000}
                    hideProgressBar={false}
                    newestOnTop={false}
                    closeOnClick
                    rtl={false}
                    pauseOnFocusLoss
                    draggable
                    pauseOnHover
                    theme="colored"
                  />
                </NotificationProvider>
              </SocketProvider>
            </LocalizationProvider>
          </ThemeProvider>
        </Provider>
      </SessionProvider>
    </ErrorBoundary>
  );
}

export default MyApp;