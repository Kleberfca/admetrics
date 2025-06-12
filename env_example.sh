# .env.example - Environment Configuration Template
# Copy this file to .env and fill in your actual values

# Application
NODE_ENV=development
PORT=3000
API_URL=http://localhost:3000
FRONTEND_URL=http://localhost:3001

# Database
DATABASE_URL=postgresql://postgres:postgres123@localhost:5432/admetrics
DATABASE_POOL_SIZE=10

# Redis Cache
REDIS_URL=redis://localhost:6379
REDIS_PREFIX=admetrics:
REDIS_TTL=3600

# JWT Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_REFRESH_SECRET=your-refresh-secret-key-change-this-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Encryption
ENCRYPTION_KEY=your-32-character-encryption-key-here

# Email Service (Choose one)
# Sendgrid
SENDGRID_API_KEY=your-sendgrid-api-key
SENDGRID_FROM_EMAIL=noreply@admetrics.ai

# Nodemailer SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@admetrics.ai

# File Upload
UPLOAD_DIR=uploads
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=jpg,jpeg,png,gif,pdf,csv,xlsx

# Google Ads API
GOOGLE_ADS_DEVELOPER_TOKEN=your-google-ads-developer-token
GOOGLE_ADS_CLIENT_ID=your-google-oauth-client-id
GOOGLE_ADS_CLIENT_SECRET=your-google-oauth-client-secret

# Facebook Ads API
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret

# TikTok Ads API
TIKTOK_APP_ID=your-tiktok-app-id
TIKTOK_APP_SECRET=your-tiktok-app-secret

# LinkedIn Ads API
LINKEDIN_CLIENT_ID=your-linkedin-client-id
LINKEDIN_CLIENT_SECRET=your-linkedin-client-secret

# Twitter Ads API
TWITTER_API_KEY=your-twitter-api-key
TWITTER_API_SECRET=your-twitter-api-secret

# YouTube Ads API (same as Google Ads)
YOUTUBE_API_KEY=your-youtube-api-key

# Pinterest Ads API
PINTEREST_APP_ID=your-pinterest-app-id
PINTEREST_APP_SECRET=your-pinterest-app-secret

# Snapchat Ads API
SNAPCHAT_CLIENT_ID=your-snapchat-client-id
SNAPCHAT_CLIENT_SECRET=your-snapchat-client-secret

# AI Engine
AI_ENGINE_URL=http://localhost:5000
AI_ENGINE_API_KEY=your-ai-engine-api-key
OPENAI_API_KEY=your-openai-api-key
MODEL_STORAGE_PATH=./models
ENABLE_AI_FEATURES=true

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000
RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS=false

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log
LOG_MAX_SIZE=20m
LOG_MAX_FILES=5

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090
ENABLE_HEALTH_CHECK=true
HEALTH_CHECK_PATH=/health

# Webhooks
WEBHOOK_SECRET=your-webhook-secret-key
WEBHOOK_TIMEOUT=30000

# External Services
SLACK_WEBHOOK_URL=your-slack-webhook-url
DISCORD_WEBHOOK_URL=your-discord-webhook-url

# Development Tools
ENABLE_SWAGGER=true
SWAGGER_TITLE=AdMetrics AI API
SWAGGER_DESCRIPTION=Advertising Campaign Analytics API
SWAGGER_VERSION=1.0.0

# Testing
TEST_DATABASE_URL=postgresql://postgres:postgres123@localhost:5432/admetrics_test
TEST_EMAIL_BYPASS=true
TEST_AI_MOCK=true

# Production Settings (uncomment for production)
# NODE_ENV=production
# ENABLE_HTTPS=true
# SSL_CERT_PATH=/path/to/cert.pem
# SSL_KEY_PATH=/path/to/key.pem
# CORS_ORIGIN=https://dashboard.admetrics.ai
# SECURE_COOKIES=true
# TRUST_PROXY=true

# Docker Settings
DOCKER_REGISTRY=your-docker-registry
DOCKER_IMAGE_TAG=latest

# Kubernetes Settings
K8S_NAMESPACE=admetrics
K8S_CLUSTER_NAME=admetrics-cluster

# Backup Settings
BACKUP_ENABLED=true
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETENTION_DAYS=30
BACKUP_STORAGE_PATH=./backups
AWS_BACKUP_BUCKET=admetrics-backups
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1

# Analytics & Tracking
GOOGLE_ANALYTICS_ID=GA-XXXXXXXXX
MIXPANEL_TOKEN=your-mixpanel-token
SEGMENT_WRITE_KEY=your-segment-write-key

# Feature Flags
ENABLE_BETA_FEATURES=false
ENABLE_ADVANCED_AI=true
ENABLE_MULTI_TENANCY=false
ENABLE_REAL_TIME_UPDATES=true

# Performance
CACHE_ENABLED=true
CACHE_TTL=300
ENABLE_COMPRESSION=true
MAX_REQUEST_SIZE=50mb

# Security
HELMET_ENABLED=true
RATE_LIMIT_ENABLED=true
CSRF_PROTECTION=true
CONTENT_SECURITY_POLICY=true
FORCE_HTTPS=false

# Sentry Error Tracking
SENTRY_DSN=your-sentry-dsn
SENTRY_ENVIRONMENT=development
SENTRY_RELEASE=1.0.0

# Monitoring & Alerting
PROMETHEUS_ENABLED=true
GRAFANA_URL=http://localhost:3000
ALERT_MANAGER_URL=http://localhost:9093

# Social Login (Optional)
GOOGLE_OAUTH_CLIENT_ID=your-google-oauth-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-oauth-client-secret
FACEBOOK_OAUTH_APP_ID=your-facebook-oauth-app-id
FACEBOOK_OAUTH_APP_SECRET=your-facebook-oauth-app-secret
GITHUB_OAUTH_CLIENT_ID=your-github-oauth-client-id
GITHUB_OAUTH_CLIENT_SECRET=your-github-oauth-client-secret

# Localization
DEFAULT_LANGUAGE=en
SUPPORTED_LANGUAGES=en,es,pt,fr,de
TIMEZONE=UTC

# AI Model Configuration
PREDICTION_MODEL_PATH=./models/performance_predictor.joblib
ANOMALY_MODEL_PATH=./models/anomaly_detector.joblib
OPTIMIZATION_MODEL_PATH=./models/budget_optimizer.joblib
MODEL_UPDATE_INTERVAL=86400
ENABLE_MODEL_TRAINING=true
TRAINING_DATA_RETENTION_DAYS=90