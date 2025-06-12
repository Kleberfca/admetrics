# .env.example - Template for environment variables
# Copy this file to .env and fill in your actual values

# ==============================================
# APPLICATION SETTINGS
# ==============================================
NODE_ENV=development
APP_VERSION=1.0.0
LOG_LEVEL=info

# ==============================================
# SERVER CONFIGURATION
# ==============================================
# Backend API Port
PORT=3000

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3001

# API Base URL
API_URL=http://localhost:3000

# WebSocket URL
WS_URL=ws://localhost:3000

# ==============================================
# DATABASE CONFIGURATION
# ==============================================
# PostgreSQL Database URL
DATABASE_URL=postgresql://postgres:postgres123@localhost:5432/admetrics

# Database Pool Settings
DB_POOL_MIN=2
DB_POOL_MAX=10

# Run migrations on startup
RUN_MIGRATIONS=true

# Seed database with sample data
SEED_DATABASE=false

# ==============================================
# REDIS CONFIGURATION
# ==============================================
# Redis URL for caching and sessions
REDIS_URL=redis://localhost:6379

# Redis Key Prefix
REDIS_PREFIX=admetrics:

# Cache TTL (in seconds)
CACHE_TTL=300

# ==============================================
# AUTHENTICATION & SECURITY
# ==============================================
# JWT Secret (use a strong, random string in production)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# JWT Expiration
JWT_EXPIRES_IN=7d

# Refresh Token Expiration
REFRESH_TOKEN_EXPIRES_IN=30d

# Session Secret
SESSION_SECRET=your-session-secret-key

# Encryption Key for sensitive data
ENCRYPTION_KEY=your-32-character-encryption-key

# ==============================================
# GOOGLE ADS API CONFIGURATION
# ==============================================
GOOGLE_ADS_DEVELOPER_TOKEN=your-google-ads-developer-token
GOOGLE_ADS_CLIENT_ID=your-google-oauth-client-id
GOOGLE_ADS_CLIENT_SECRET=your-google-oauth-client-secret

# ==============================================
# FACEBOOK ADS API CONFIGURATION
# ==============================================
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret

# ==============================================
# OTHER PLATFORM APIS
# ==============================================
# TikTok Ads
TIKTOK_APP_ID=your-tiktok-app-id
TIKTOK_SECRET=your-tiktok-secret

# LinkedIn Ads
LINKEDIN_CLIENT_ID=your-linkedin-client-id
LINKEDIN_CLIENT_SECRET=your-linkedin-client-secret

# Twitter/X Ads
TWITTER_API_KEY=your-twitter-api-key
TWITTER_API_SECRET=your-twitter-api-secret

# ==============================================
# AI ENGINE CONFIGURATION
# ==============================================
# AI Engine URL
AI_ENGINE_URL=http://localhost:5000

# MLflow Tracking URI
MLFLOW_TRACKING_URI=sqlite:///mlflow.db

# Model Storage Path
MODEL_PATH=/app/models

# Default Model Type (prophet, lstm, ensemble)
DEFAULT_MODEL_TYPE=ensemble

# ==============================================
# EMAIL CONFIGURATION
# ==============================================
# SMTP Settings for notifications
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Email sender info
EMAIL_FROM=noreply@admetrics.ai
EMAIL_FROM_NAME=AdMetrics AI

# ==============================================
# MONITORING & LOGGING
# ==============================================
# Enable metrics collection
ENABLE_METRICS=true

# Sentry DSN for error tracking
SENTRY_DSN=your-sentry-dsn

# Enable request logging
ENABLE_REQUEST_LOGGING=true

# Log retention days
LOG_RETENTION_DAYS=30

# ==============================================
# RATE LIMITING
# ==============================================
# Requests per minute per IP
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# API rate limits
API_RATE_LIMIT=1000
AUTH_RATE_LIMIT=5

# ==============================================
# FILE UPLOAD CONFIGURATION
# ==============================================
# Maximum file size (in bytes)
MAX_FILE_SIZE=52428800

# Allowed file types
ALLOWED_FILE_TYPES=csv,xlsx,json

# Upload directory
UPLOAD_DIR=./uploads

# ==============================================
# DEVELOPMENT SETTINGS
# ==============================================
# Enable debug mode
DEBUG=false

# Enable API documentation
ENABLE_API_DOCS=true

# Enable development seed data
DEV_SEED_DATA=false

# Hot reload for development
HOT_RELOAD=true

---

# .env.production - Production environment variables template
# Use this for production deployments

NODE_ENV=production
LOG_LEVEL=warn

# Production URLs
FRONTEND_URL=https://dashboard.admetrics.ai
API_URL=https://api.admetrics.ai
WS_URL=wss://api.admetrics.ai

# Production Database (use environment-specific values)
DATABASE_URL=postgresql://username:password@db-host:5432/admetrics_prod

# Production Redis
REDIS_URL=redis://redis-host:6379

# Strong JWT secret (generate with: openssl rand -base64 32)
JWT_SECRET=${JWT_SECRET}

# Disable development features
DEBUG=false
ENABLE_API_DOCS=false
DEV_SEED_DATA=false
HOT_RELOAD=false

# Enhanced security
ENABLE_METRICS=true
ENABLE_REQUEST_LOGGING=true

# Production rate limits
RATE_LIMIT_MAX_REQUESTS=1000
API_RATE_LIMIT=5000

---

# .env.test - Test environment variables
NODE_ENV=test
LOG_LEVEL=error

# Test database
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/admetrics_test

# Test Redis
REDIS_URL=redis://localhost:6380

# Test JWT secret
JWT_SECRET=test-jwt-secret-key

# Disable external services in tests
ENABLE_METRICS=false
ENABLE_REQUEST_LOGGING=false

# Fast test settings
CACHE_TTL=10
JWT_EXPIRES_IN=1h

# Mock API endpoints
MOCK_GOOGLE_ADS=true
MOCK_FACEBOOK_ADS=true
MOCK_AI_ENGINE=true

---

# docker-compose.override.yml - Development overrides
version: '3.8'

services:
  backend:
    volumes:
      - ./backend:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
      - DEBUG=true
      - HOT_RELOAD=true
    command: npm run dev

  frontend:
    volumes:
      - ./frontend:/app
      - /app/node_modules
    environment:
      - REACT_APP_ENVIRONMENT=development
      - CHOKIDAR_USEPOLLING=true
    command: npm start

  ai-engine:
    volumes:
      - ./ai-engine:/app
      - /app/__pycache__
    environment:
      - FLASK_ENV=development
      - FLASK_DEBUG=1
    command: python -m flask run --host=0.0.0.0 --port=5000 --reload

  postgres:
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=admetrics_dev
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data

  redis:
    ports:
      - "6379:6379"

volumes:
  postgres_dev_data: