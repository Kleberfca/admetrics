import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { metricsApi } from '@/services/api';

interface DashboardMetrics {
  totalSpend: number;
  totalClicks: number;
  totalConversions: number;
  averageRoas: number;
  spendChange: number;
  clicksChange: number;
  conversionsChange: number;
  roasChange: number;
}

interface TopCampaign {
  id: string;
  name: string;
  platform: string;
  spend: number;
  conversions: number;
  roas: number;
  trend: 'up' | 'down' | 'stable';
}

interface PlatformPerformance {
  platform: string;
  spend: number;
  conversions: number;
  roas: number;
}

interface Alert {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  createdAt: string;
}

interface DashboardState {
  metrics: DashboardMetrics | null;
  topCampaigns: TopCampaign[];
  platformPerformance: PlatformPerformance[];
  recentAlerts: Alert[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

const initialState: DashboardState = {
  metrics: null,
  topCampaigns: [],
  platformPerformance: [],
  recentAlerts: [],
  isLoading: false,
  error: null,
  lastUpdated: null
};

// Async thunks
export const fetchDashboardData = createAsyncThunk(
  'dashboard/fetchData',
  async ({ period }: { period: string }) => {
    const response = await metricsApi.getDashboard({ period });
    return response.data;
  }
);

export const refreshDashboardData = createAsyncThunk(
  'dashboard/refresh',
  async ({ period }: { period: string }) => {
    const response = await metricsApi.getDashboard({ period, fresh: true });
    return response.data;
  }
);

// Slice
const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    updateMetrics: (state, action: PayloadAction<Partial<DashboardMetrics>>) => {
      if (state.metrics) {
        state.metrics = { ...state.metrics, ...action.payload };
      }
    },
    addAlert: (state, action: PayloadAction<Alert>) => {
      state.recentAlerts.unshift(action.payload);
      if (state.recentAlerts.length > 10) {
        state.recentAlerts.pop();
      }
    },
    clearAlerts: (state) => {
      state.recentAlerts = [];
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch dashboard data
      .addCase(fetchDashboardData.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchDashboardData.fulfilled, (state, action) => {
        state.isLoading = false;
        state.metrics = action.payload.metrics;
        state.topCampaigns = action.payload.topCampaigns;
        state.platformPerformance = action.payload.platformPerformance;
        state.recentAlerts = action.payload.recentAlerts;
        state.lastUpdated = new Date().toISOString();
      })
      .addCase(fetchDashboardData.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to fetch dashboard data';
      })
      // Refresh dashboard data
      .addCase(refreshDashboardData.fulfilled, (state, action) => {
        state.metrics = action.payload.metrics;
        state.topCampaigns = action.payload.topCampaigns;
        state.platformPerformance = action.payload.platformPerformance;
        state.recentAlerts = action.payload.recentAlerts;
        state.lastUpdated = new Date().toISOString();
      });
  }
});

export const { updateMetrics, addAlert, clearAlerts, setError } = dashboardSlice.actions;
export default dashboardSlice.reducer;