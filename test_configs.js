// backend/jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/*.(test|spec).+(ts|tsx|js)'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/types/**/*',
    '!src/**/*.interface.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  testTimeout: 30000,
  maxWorkers: 1, // For database tests
  forceExit: true,
  detectOpenHandles: true,
  verbose: true
};

---

// backend/tests/setup.ts
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';

// Test database setup
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
    }
  }
});

// Global test setup
beforeAll(async () => {
  // Create unique test database
  const testDbName = `test_${uuidv4().replace(/-/g, '')}`;
  process.env.TEST_DATABASE_URL = process.env.DATABASE_URL?.replace(
    /\/\w+(\?|$)/,
    `/${testDbName}$1`
  );

  // Run migrations
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }
  });

  // Connect to test database
  await prisma.$connect();
});

// Clean up after each test
afterEach(async () => {
  // Clean up test data
  const tableNames = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname='public'
  `;

  for (const { tablename } of tableNames) {
    if (tablename !== '_prisma_migrations') {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" CASCADE`);
    }
  }
});

// Global cleanup
afterAll(async () => {
  await prisma.$disconnect();
});

// Mock external services
jest.mock('../src/services/google-ads.service');
jest.mock('../src/services/facebook-ads.service');
jest.mock('nodemailer');

// Global test utilities
global.createTestUser = async () => {
  return prisma.user.create({
    data: {
      email: 'test@example.com',
      name: 'Test User',
      password: 'hashedpassword'
    }
  });
};

global.createTestCampaign = async (userId: string) => {
  return prisma.campaign.create({
    data: {
      externalId: 'test-campaign-1',
      name: 'Test Campaign',
      platform: 'GOOGLE_ADS',
      status: 'ACTIVE',
      userId,
      integrationId: 'test-integration'
    }
  });
};

---

// frontend/jest.config.js
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  },
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
    '^.+\\.(js|jsx)$': 'babel-jest'
  },
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.(ts|tsx|js)',
    '<rootDir>/src/**/*.(test|spec).(ts|tsx|js)'
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/index.tsx',
    '!src/serviceWorker.ts',
    '!src/reportWebVitals.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node']
};

---

// frontend/src/setupTests.ts
import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';
import 'whatwg-fetch';

// Configure testing library
configure({ testIdAttribute: 'data-testid' });

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock scrollTo
Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: jest.fn()
});

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock
});

// Setup environment variables
process.env.REACT_APP_API_URL = 'http://localhost:3000/api';
process.env.REACT_APP_WS_URL = 'ws://localhost:3000';

---

// frontend/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['junit', { outputFile: 'test-results/junit.xml' }]
  ],
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  webServer: [
    {
      command: 'npm run start',
      port: 3001,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'cd ../backend && npm run dev',
      port: 3000,
      reuseExistingServer: !process.env.CI,
    }
  ],
});

---

// frontend/tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/auth/login');

    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');

    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/auth/login');

    await page.fill('[data-testid="email-input"]', 'invalid@example.com');
    await page.fill('[data-testid="password-input"]', 'wrongpassword');
    await page.click('[data-testid="login-button"]');

    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText('Invalid credentials');
  });

  test('should register new user', async ({ page }) => {
    await page.goto('/auth/register');

    await page.fill('[data-testid="name-input"]', 'New User');
    await page.fill('[data-testid="email-input"]', 'newuser@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.fill('[data-testid="confirm-password-input"]', 'password123');
    await page.click('[data-testid="register-button"]');

    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('[data-testid="welcome-message"]')).toBeVisible();
  });

  test('should logout user', async ({ page }) => {
    // Login first
    await page.goto('/auth/login');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');

    // Logout
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout-button"]');

    await expect(page).toHaveURL('/auth/login');
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
  });
});

---

// frontend/tests/e2e/dashboard.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/auth/login');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('should display dashboard metrics', async ({ page }) => {
    await expect(page.locator('[data-testid="total-spend-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="total-clicks-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="total-conversions-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="average-roas-card"]')).toBeVisible();
  });

  test('should filter by date range', async ({ page }) => {
    await page.click('[data-testid="date-range-picker"]');
    await page.click('[data-testid="last-7-days"]');
    
    // Wait for data to reload
    await page.waitForLoadState('networkidle');
    
    await expect(page.locator('[data-testid="date-range-display"]')).toContainText('Last 7 days');
  });

  test('should display performance chart', async ({ page }) => {
    await expect(page.locator('[data-testid="performance-chart"]')).toBeVisible();
    
    // Check if chart has data points
    await expect(page.locator('[data-testid="performance-chart"] .recharts-line')).toBeVisible();
  });

  test('should show AI insights', async ({ page }) => {
    await expect(page.locator('[data-testid="ai-insights-section"]')).toBeVisible();
    
    // Check if at least one insight is displayed
    const insightCards = page.locator('[data-testid^="ai-insight-card-"]');
    await expect(insightCards.first()).toBeVisible();
  });

  test('should navigate to campaigns page', async ({ page }) => {
    await page.click('[data-testid="campaigns-nav-link"]');
    await expect(page).toHaveURL('/campaigns');
    await expect(page.locator('[data-testid="campaigns-table"]')).toBeVisible();
  });

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Check that mobile menu is visible
    await expect(page.locator('[data-testid="mobile-menu-button"]')).toBeVisible();
    
    // Metric cards should stack vertically
    const metricCards = page.locator('[data-testid$="-card"]');
    const firstCard = metricCards.first();
    const secondCard = metricCards.nth(1);
    
    const firstCardBox = await firstCard.boundingBox();
    const secondCardBox = await secondCard.boundingBox();
    
    // Second card should be below first card (vertical stacking)
    expect(secondCardBox!.y).toBeGreaterThan(firstCardBox!.y + firstCardBox!.height);
  });
});

---

// ai-engine/conftest.py
import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import tempfile
import os
from sqlalchemy import create_engine
from src.models.prediction.performance_predictor import PerformancePredictor
from src.models.optimization.budget_optimizer import BudgetOptimizer

@pytest.fixture
def sample_campaign_data():
    """Create sample campaign data for testing."""
    dates = pd.date_range(start='2023-01-01', end='2023-03-31', freq='D')
    
    np.random.seed(42)  # For reproducible tests
    
    return pd.DataFrame({
        'date': dates,
        'campaign_id': ['campaign_1'] * len(dates),
        'spend': np.random.uniform(100, 1000, len(dates)),
        'clicks': np.random.randint(50, 500, len(dates)),
        'conversions': np.random.randint(5, 50, len(dates)),
        'impressions': np.random.randint(1000, 10000, len(dates)),
        'platform': ['GOOGLE_ADS'] * len(dates)
    })

@pytest.fixture
def sample_metrics_data():
    """Create sample metrics data for testing."""
    return {
        'campaign_id': 'test-campaign-1',
        'metrics': [
            {
                'date': '2023-01-01',
                'spend': 100.0,
                'clicks': 50,
                'conversions': 5,
                'impressions': 1000
            },
            {
                'date': '2023-01-02',
                'spend': 120.0,
                'clicks': 60,
                'conversions': 6,
                'impressions': 1200
            }
        ]
    }

@pytest.fixture
def performance_predictor():
    """Create a PerformancePredictor instance."""
    return PerformancePredictor(model_type='prophet')

@pytest.fixture
def budget_optimizer():
    """Create a BudgetOptimizer instance."""
    return BudgetOptimizer()

@pytest.fixture
def temp_model_dir():
    """Create a temporary directory for model storage."""
    with tempfile.TemporaryDirectory() as temp_dir:
        yield temp_dir

@pytest.fixture
def test_database_url():
    """Create test database URL."""
    return os.getenv('TEST_DATABASE_URL', 'sqlite:///test.db')

@pytest.fixture
def test_engine(test_database_url):
    """Create test database engine."""
    engine = create_engine(test_database_url)
    yield engine
    engine.dispose()

@pytest.fixture
def mock_redis():
    """Mock Redis client for testing."""
    class MockRedis:
        def __init__(self):
            self.data = {}
        
        def get(self, key):
            return self.data.get(key)
        
        def set(self, key, value):
            self.data[key] = value
        
        def setex(self, key, ttl, value):
            self.data[key] = value
        
        def delete(self, key):
            if key in self.data:
                del self.data[key]
        
        def ping(self):
            return True
    
    return MockRedis()

---

// ai-engine/pytest.ini
[tool:pytest]
testpaths = tests
python_files = test_*.py
python_functions = test_*
python_classes = Test*
addopts = 
    -v
    --tb=short
    --strict-markers
    --cov=src
    --cov-report=term-missing
    --cov-report=html
    --cov-report=xml
    --cov-fail-under=80
markers =
    slow: marks tests as slow (deselect with '-m "not slow"')
    integration: marks tests as integration tests
    unit: marks tests as unit tests
    prediction: marks tests related to prediction models
    optimization: marks tests related to optimization models
filterwarnings =
    ignore::UserWarning
    ignore::DeprecationWarning