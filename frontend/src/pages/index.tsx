import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import Head from 'next/head';
import { Box, Container, Grid, Paper, Typography, Skeleton } from '@mui/material';
import { 
  TrendingUp, 
  TrendingDown, 
  AttachMoney, 
  MouseOutlined,
  ShoppingCart,
  Percent
} from '@mui/icons-material';

import { DashboardMetricCard } from '@/components/Dashboard/MetricCard';
import { PerformanceChart } from '@/components/Dashboard/PerformanceChart';
import { PlatformBreakdown } from '@/components/Dashboard/PlatformBreakdown';
import { TopCampaigns } from '@/components/Dashboard/TopCampaigns';
import { RecentAlerts } from '@/components/Dashboard/RecentAlerts';
import { QuickActions } from '@/components/Dashboard/QuickActions';
import { useAppDispatch, useAppSelector } from '@/hooks/redux';
import { fetchDashboardData } from '@/store/slices/dashboardSlice';
import { formatCurrency, formatNumber, formatPercentage } from '@/utils/formatters';

export default function Dashboard() {
  const router = useRouter();
  const { data: session } = useSession();
  const dispatch = useAppDispatch();
  
  const { 
    metrics, 
    topCampaigns, 
    platformPerformance,
    recentAlerts,
    isLoading, 
    error 
  } = useAppSelector((state) => state.dashboard);

  useEffect(() => {
    if (session?.user) {
      dispatch(fetchDashboardData({ period: '7d' }));
    }
  }, [session, dispatch]);

  if (isLoading) {
    return (
      <Container maxWidth="xl">
        <Box sx={{ mt: 4 }}>
          <Grid container spacing={3}>
            {[1, 2, 3, 4].map((i) => (
              <Grid item xs={12} sm={6} md={3} key={i}>
                <Skeleton variant="rectangular" height={140} />
              </Grid>
            ))}
          </Grid>
        </Box>
      </Container>
    );
  }

  return (
    <>
      <Head>
        <title>Dashboard - AdMetrics</title>
        <meta name="description" content="AdMetrics Dashboard - Monitor your advertising performance" />
      </Head>

      <Container maxWidth="xl">
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Welcome back, {session?.user?.name?.split(' ')[0]}!
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Here's your advertising performance overview for the last 7 days.
          </Typography>
        </Box>

        {/* Quick Actions */}
        <Box sx={{ mb: 3 }}>
          <QuickActions />
        </Box>

        {/* Key Metrics */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <DashboardMetricCard
              title="Total Spend"
              value={formatCurrency(metrics?.totalSpend || 0)}
              change={metrics?.spendChange || 0}
              icon={<AttachMoney />}
              color="primary"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <DashboardMetricCard
              title="Total Clicks"
              value={formatNumber(metrics?.totalClicks || 0)}
              change={metrics?.clicksChange || 0}
              icon={<MouseOutlined />}
              color="info"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <DashboardMetricCard
              title="Conversions"
              value={formatNumber(metrics?.totalConversions || 0)}
              change={metrics?.conversionsChange || 0}
              icon={<ShoppingCart />}
              color="success"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <DashboardMetricCard
              title="Avg. ROAS"
              value={formatPercentage(metrics?.averageRoas || 0)}
              change={metrics?.roasChange || 0}
              icon={<Percent />}
              color="warning"
              format="percentage"
            />
          </Grid>
        </Grid>

        {/* Charts Row */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={8}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" gutterBottom>
                Performance Trend
              </Typography>
              <PerformanceChart period="7d" />
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" gutterBottom>
                Platform Breakdown
              </Typography>
              <PlatformBreakdown data={platformPerformance} />
            </Paper>
          </Grid>
        </Grid>

        {/* Bottom Row */}
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Top Performing Campaigns
              </Typography>
              <TopCampaigns campaigns={topCampaigns} />
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Recent Alerts
              </Typography>
              <RecentAlerts alerts={recentAlerts} />
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </>
  );
}

// This page requires authentication
Dashboard.requireAuth = true;