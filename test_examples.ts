// Backend test example: metrics.service.test.ts
import { PrismaClient } from '@prisma/client';
import { RedisClientType } from 'redis';
import { MetricsService } from '../src/services/metrics.service';
import { MetricsQueryOptions } from '../src/types/metrics.types';

// Mock dependencies
jest.mock('@prisma/client');
jest.mock('redis');

describe('MetricsService', () => {
  let metricsService: MetricsService;
  let prismaMock: jest.Mocked<PrismaClient>;
  let redisMock: jest.Mocked<RedisClientType>;

  beforeEach(() => {
    prismaMock = {
      metric: {
        findMany: jest.fn(),
        groupBy: jest.fn(),
        upsert: jest.fn(),
      },
      campaign: {
        findMany: jest.fn(),
      },
    } as any;

    redisMock = {
      get: jest.fn(),
      setEx: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
    } as any;

    metricsService = new MetricsService(prismaMock, redisMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDashboardMetrics', () => {
    const userId = 'test-user-id';
    const options: MetricsQueryOptions = {
      startDate: new Date('2023-01-01'),
      endDate: new Date('2023-01-31'),
      platforms: ['GOOGLE_ADS', 'FACEBOOK_ADS'],
    };

    it('should return cached metrics if available', async () => {
      // Arrange
      const cachedMetrics = {
        currentPeriod: {
          totalSpend: 1000,
          totalClicks: 500,
          totalConversions: 25,
          averageROAS: 2.5,
        },
      };
      redisMock.get.mockResolvedValue(JSON.stringify(cachedMetrics));

      // Act
      const result = await metricsService.getDashboardMetrics(userId, options);

      // Assert
      expect(result).toEqual(cachedMetrics);
      expect(redisMock.get).toHaveBeenCalledWith(
        expect.stringContaining('dashboard:metrics:test-user-id')
      );
      expect(prismaMock.metric.findMany).not.toHaveBeenCalled();
    });

    it('should calculate metrics from database when cache is empty', async () => {
      // Arrange
      redisMock.get.mockResolvedValue(null);
      const mockMetrics = [
        {
          spend: 100,
          clicks: 50,
          impressions: 1000,
          conversions: 5,
          revenue: 250,
        },
      ];
      prismaMock.metric.findMany.mockResolvedValue(mockMetrics as any);
      prismaMock.campaign.findMany.mockResolvedValue([]);

      // Act
      const result = await metricsService.getDashboardMetrics(userId, options);

      // Assert
      expect(result.currentPeriod.totalSpend).toBe(100);
      expect(result.currentPeriod.totalClicks).toBe(50);
      expect(result.currentPeriod.totalConversions).toBe(5);
      expect(redisMock.setEx).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      redisMock.get.mockResolvedValue(null);
      prismaMock.metric.findMany.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(
        metricsService.getDashboardMetrics(userId, options)
      ).rejects.toThrow('Failed to get dashboard metrics: Database error');
    });
  });

  describe('storeMetrics', () => {
    it('should validate and store metrics successfully', async () => {
      // Arrange
      const mockMetrics = [
        {
          campaignId: 'campaign-1',
          integrationId: 'integration-1',
          date: new Date('2023-01-01'),
          platform: 'GOOGLE_ADS',
          metricType: 'DAILY',
          impressions: BigInt(1000),
          clicks: BigInt(50),
          spend: 100,
          conversions: 5,
          revenue: 250,
        },
      ];

      prismaMock.metric.upsert.mockResolvedValue({} as any);
      redisMock.keys.mockResolvedValue([]);

      // Act
      await metricsService.storeMetrics(mockMetrics as any);

      // Assert
      expect(prismaMock.metric.upsert).toHaveBeenCalledTimes(1);
      expect(prismaMock.metric.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            campaignId_date_metricType: expect.any(Object),
          }),
          update: expect.any(Object),
          create: expect.any(Object),
        })
      );
    });

    it('should handle validation errors', async () => {
      // Arrange
      const invalidMetrics = [
        {
          // Missing required fields
          platform: 'INVALID_PLATFORM',
        },
      ];

      // Act & Assert
      await expect(
        metricsService.storeMetrics(invalidMetrics as any)
      ).rejects.toThrow();
    });
  });
});

---

// Frontend test example: Dashboard.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { Dashboard } from '../src/pages/Dashboard';
import { apiService } from '../src/services/api.service';

// Mock dependencies
jest.mock('../src/services/api.service');
jest.mock('../src/hooks/useRealTimeMetrics', () => ({
  useRealTimeMetrics: () => ({
    totalSpend: 1000,
    totalClicks: 500,
    totalConversions: 25,
    averageROAS: 2.5,
  }),
}));

const mockedApiService = apiService as jest.Mocked<typeof apiService>;

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('Dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render dashboard with metrics', async () => {
    // Arrange
    const mockDashboardData = {
      metrics: {
        totalSpend: 1000,
        totalClicks: 500,
        totalConversions: 25,
        averageROAS: 2.5,
      },
      previousPeriodMetrics: {
        totalSpend: 800,
        totalClicks: 400,
        totalConversions: 20,
        averageROAS: 2.0,
      },
      performanceData: [],
      platformData: [],
      topCampaigns: [],
    };

    mockedApiService.getDashboardData.mockResolvedValue(mockDashboardData);

    // Act
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>
    );

    // Assert
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('$1,000')).toBeInTheDocument(); // Total spend
      expect(screen.getByText('500')).toBeInTheDocument(); // Total clicks
      expect(screen.getByText('25')).toBeInTheDocument(); // Total conversions
      expect(screen.getByText('2.5x')).toBeInTheDocument(); // Average ROAS
    });
  });

  it('should handle API errors gracefully', async () => {
    // Arrange
    mockedApiService.getDashboardData.mockRejectedValue(
      new Error('API Error')
    );

    // Act
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>
    );

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/Failed to load dashboard/)).toBeInTheDocument();
      expect(screen.getByText(/Please try again/)).toBeInTheDocument();
    });
  });

  it('should allow date range selection', async () => {
    // Arrange
    const user = userEvent.setup();
    const mockDashboardData = {
      metrics: {},
      previousPeriodMetrics: {},
      performanceData: [],
      platformData: [],
      topCampaigns: [],
    };

    mockedApiService.getDashboardData.mockResolvedValue(mockDashboardData);

    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>
    );

    // Act
    const dateRangePicker = screen.getByRole('button', { name: /date range/i });
    await user.click(dateRangePicker);

    // Assert
    expect(screen.getByText(/Last 7 days/)).toBeInTheDocument();
    expect(screen.getByText(/Last 30 days/)).toBeInTheDocument();
    expect(screen.getByText(/Custom range/)).toBeInTheDocument();
  });

  it('should refresh data when refresh button is clicked', async () => {
    // Arrange
    const user = userEvent.setup();
    const mockDashboardData = {
      metrics: {},
      previousPeriodMetrics: {},
      performanceData: [],
      platformData: [],
      topCampaigns: [],
    };

    mockedApiService.getDashboardData.mockResolvedValue(mockDashboardData);

    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>
    );

    // Wait for initial load
    await waitFor(() => {
      expect(mockedApiService.getDashboardData).toHaveBeenCalledTimes(1);
    });

    // Act
    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    await user.click(refreshButton);

    // Assert
    await waitFor(() => {
      expect(mockedApiService.getDashboardData).toHaveBeenCalledTimes(2);
    });
  });

  it('should display AI insights when available', async () => {
    // Arrange
    const mockDashboardData = {
      metrics: {},
      previousPeriodMetrics: {},
      performanceData: [],
      platformData: [],
      topCampaigns: [],
    };

    const mockAIInsights = [
      {
        id: 'insight-1',
        title: 'Budget Optimization Opportunity',
        description: 'Increase budget for Campaign A by 20%',
        type: 'OPTIMIZATION',
        priority: 'HIGH',
        confidence: 0.85,
        recommendations: ['Increase daily budget to $150'],
      },
    ];

    mockedApiService.getDashboardData.mockResolvedValue(mockDashboardData);
    mockedApiService.getAIInsights.mockResolvedValue(mockAIInsights);

    // Act
    render(
      <TestWrapper>
        <Dashboard />
      </TestWrapper>
    );

    // Assert
    await waitFor(() => {
      expect(screen.getByText('AI Insights')).toBeInTheDocument();
      expect(screen.getByText('Budget Optimization Opportunity')).toBeInTheDocument();
      expect(screen.getByText(/Increase budget for Campaign A/)).toBeInTheDocument();
    });
  });
});

---

// AI Engine test example: performance_predictor.test.py
import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from unittest.mock import Mock, patch
from src.models.prediction.performance_predictor import PerformancePredictor

class TestPerformancePredictor:
    """Test suite for Performance Predictor model."""
    
    @pytest.fixture
    def sample_data(self):
        """Create sample campaign data for testing."""
        dates = pd.date_range(start='2023-01-01', end='2023-03-31', freq='D')
        
        return pd.DataFrame({
            'date': dates,
            'spend': np.random.uniform(100, 1000, len(dates)),
            'clicks': np.random.randint(50, 500, len(dates)),
            'conversions': np.random.randint(5, 50, len(dates)),
            'impressions': np.random.randint(1000, 10000, len(dates)),
            'platform': ['GOOGLE_ADS'] * len(dates)
        })
    
    @pytest.fixture
    def predictor(self):
        """Create PerformancePredictor instance."""
        return PerformancePredictor(model_type='ensemble')
    
    def test_prepare_features(self, predictor, sample_data):
        """Test feature engineering pipeline."""
        # Act
        processed_data = predictor.prepare_features(sample_data)
        
        # Assert
        assert 'year' in processed_data.columns
        assert 'month' in processed_data.columns
        assert 'day_of_week' in processed_data.columns
        assert 'is_weekend' in processed_data.columns
        assert 'month_sin' in processed_data.columns
        assert 'month_cos' in processed_data.columns
        
        # Check lag features
        assert 'spend_lag_1' in processed_data.columns
        assert 'clicks_rolling_mean_7' in processed_data.columns
        
        # Check derived metrics
        assert 'cpc' in processed_data.columns
        assert 'ctr' in processed_data.columns
    
    def test_train_prophet_model(self, predictor, sample_data):
        """Test Prophet model training."""
        # Act
        model = predictor.train_prophet_model(sample_data, 'spend')
        
        # Assert
        assert model is not None
        assert hasattr(model, 'predict')
        assert hasattr(model, 'make_future_dataframe')
    
    @patch('src.models.prediction.performance_predictor.lgb.LGBMRegressor')
    def test_train_lightgbm_model(self, mock_lgb, predictor, sample_data):
        """Test LightGBM model training."""
        # Arrange
        mock_model = Mock()
        mock_lgb.return_value = mock_model
        
        processed_data = predictor.prepare_features(sample_data)
        
        # Act
        result = predictor.train_lightgbm_model(processed_data, 'spend')
        
        # Assert
        assert result == mock_model
        mock_model.fit.assert_called_once()
    
    def test_train_models_integration(self, predictor, sample_data):
        """Test complete model training pipeline."""
        # Act
        results = predictor.train(sample_data, ['spend', 'clicks'])
        
        # Assert
        assert 'spend' in results
        assert 'clicks' in results
        assert predictor.is_trained
        
        # Check that models were created
        if predictor.model_type == 'ensemble':
            assert 'spend_prophet' in predictor.models
            assert 'clicks_prophet' in predictor.models
    
    def test_predict_requires_trained_model(self, predictor, sample_data):
        """Test that prediction requires trained models."""
        # Act & Assert
        with pytest.raises(ValueError, match="Models must be trained"):
            predictor.predict(sample_data, 'campaign-1', 30)
    
    def test_predict_with_trained_model(self, predictor, sample_data):
        """Test prediction with trained models."""
        # Arrange
        predictor.train(sample_data, ['spend'])
        
        # Act
        predictions = predictor.predict(sample_data, 'campaign-1', 7)
        
        # Assert
        assert 'campaign_id' in predictions
        assert 'predictions' in predictions
        assert 'prediction_horizon' in predictions
        assert predictions['campaign_id'] == 'campaign-1'
        assert predictions['prediction_horizon'] == 7
        
        if 'spend' in predictions['predictions']:
            spend_pred = predictions['predictions']['spend']
            assert 'values' in spend_pred
            assert 'dates' in spend_pred
            assert len(spend_pred['values']) == 7
            assert len(spend_pred['dates']) == 7
    
    def test_calculate_confidence_intervals(self, predictor):
        """Test confidence interval calculation."""
        # Arrange
        mock_predictions = {
            'predictions': {
                'spend': {
                    'values': [100, 150, 200, 180, 220, 250, 300]
                }
            }
        }
        
        # Act
        confidence = predictor.calculate_confidence_intervals(mock_predictions)
        
        # Assert
        assert 'spend' in confidence
        assert 'ci_95_lower' in confidence['spend']
        assert 'ci_95_upper' in confidence['spend']
        assert 'median' in confidence['spend']
        assert 'std' in confidence['spend']
    
    def test_model_persistence(self, predictor, sample_data, tmp_path):
        """Test model saving and loading."""
        # Arrange
        predictor.train(sample_data, ['spend'])
        model_path = tmp_path / "test_model.joblib"
        
        # Act - Save
        predictor.save_models(str(model_path))
        
        # Create new predictor and load
        new_predictor = PerformancePredictor()
        new_predictor.load_models(str(model_path))
        
        # Assert
        assert new_predictor.is_trained
        assert new_predictor.model_type == predictor.model_type
        assert len(new_predictor.models) == len(predictor.models)
    
    def test_feature_importance_extraction(self, predictor, sample_data):
        """Test feature importance extraction."""
        # Arrange
        predictor.train(sample_data, ['spend'])
        
        # Act
        importance = predictor.get_feature_importance('spend')
        
        # Assert
        if importance:  # Only check if LightGBM model was trained
            assert isinstance(importance, dict)
            assert len(importance) > 0
    
    @pytest.mark.parametrize("model_type", ['prophet', 'lstm', 'ensemble'])
    def test_different_model_types(self, model_type, sample_data):
        """Test different model types."""
        # Arrange
        predictor = PerformancePredictor(model_type=model_type)
        
        # Act
        results = predictor.train(sample_data, ['spend'])
        
        # Assert
        assert 'spend' in results
        assert predictor.is_trained
    
    def test_invalid_data_handling(self, predictor):
        """Test handling of invalid data."""
        # Arrange
        invalid_data = pd.DataFrame({
            'date': ['invalid_date', '2023-01-02'],
            'spend': [None, 100],
            'clicks': [-10, 50]  # Negative values
        })
        
        # Act & Assert
        with pytest.raises(Exception):
            predictor.prepare_features(invalid_data)
    
    def test_empty_data_handling(self, predictor):
        """Test handling of empty datasets."""
        # Arrange
        empty_data = pd.DataFrame()
        
        # Act & Assert
        with pytest.raises(Exception):
            predictor.train(empty_data, ['spend'])

---

// Integration test example: api.integration.test.ts
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../src/app';
import { setupTestDatabase, cleanupTestDatabase } from './utils/test-database';

describe('API Integration Tests', () => {
  let prisma: PrismaClient;
  let authToken: string;

  beforeAll(async () => {
    prisma = await setupTestDatabase();
  });

  afterAll(async () => {
    await cleanupTestDatabase(prisma);
  });

  beforeEach(async () => {
    // Create test user and get auth token
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'testpassword123',
        name: 'Test User',
      });

    authToken = response.body.token;
  });

  describe('Dashboard API', () => {
    it('should return dashboard metrics for authenticated user', async () => {
      // Arrange - Create test data
      await prisma.campaign.create({
        data: {
          externalId: 'test-campaign-1',
          name: 'Test Campaign',
          platform: 'GOOGLE_ADS',
          status: 'ACTIVE',
          userId: 'test-user-id',
          integrationId: 'test-integration',
        },
      });

      // Act
      const response = await request(app)
        .get('/api/dashboard/metrics')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          startDate: '2023-01-01',
          endDate: '2023-01-31',
          platforms: 'GOOGLE_ADS,FACEBOOK_ADS',
        });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('currentPeriod');
      expect(response.body).toHaveProperty('previousPeriod');
      expect(response.body).toHaveProperty('performanceData');
      expect(response.body.currentPeriod).toHaveProperty('totalSpend');
      expect(response.body.currentPeriod).toHaveProperty('totalClicks');
    });

    it('should require authentication', async () => {
      // Act
      const response = await request(app)
        .get('/api/dashboard/metrics');

      // Assert
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should validate date range parameters', async () => {
      // Act
      const response = await request(app)
        .get('/api/dashboard/metrics')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          startDate: 'invalid-date',
          endDate: '2023-01-31',
        });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Campaign Management API', () => {
    it('should create a new campaign', async () => {
      // Act
      const response = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          externalId: 'new-campaign-1',
          name: 'New Test Campaign',
          platform: 'FACEBOOK_ADS',
          budget: 1000,
          budgetType: 'DAILY',
          startDate: '2023-01-01',
          objective: 'CONVERSIONS',
        });

      // Assert
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('New Test Campaign');
      expect(response.body.platform).toBe('FACEBOOK_ADS');
    });

    it('should get user campaigns', async () => {
      // Arrange - Create test campaigns
      await prisma.campaign.createMany({
        data: [
          {
            externalId: 'campaign-1',
            name: 'Campaign 1',
            platform: 'GOOGLE_ADS',
            status: 'ACTIVE',
            userId: 'test-user-id',
            integrationId: 'test-integration',
          },
          {
            externalId: 'campaign-2',
            name: 'Campaign 2',
            platform: 'FACEBOOK_ADS',
            status: 'PAUSED',
            userId: 'test-user-id',
            integrationId: 'test-integration',
          },
        ],
      });

      // Act
      const response = await request(app)
        .get('/api/campaigns')
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('campaigns');
      expect(Array.isArray(response.body.campaigns)).toBe(true);
      expect(response.body.campaigns).toHaveLength(2);
    });
  });
});