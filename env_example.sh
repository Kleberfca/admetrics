# AdMetrics AI Dashboard - Environment Configuration
# Copy this file to .env and update with your actual values

# =============================================================================
# GENERAL SETTINGS
# =============================================================================
NODE_ENV=development
PYTHON_ENV=development
LOG_LEVEL=info
ENABLE_METRICS=true

# =============================================================================
# SERVER PORTS
# =============================================================================
BACKEND_PORT=3000
FRONTEND_PORT=3001
AI_ENGINE_PORT=5000
HTTP_PORT=80
HTTPS_PORT=443

# =============================================================================
# FRONTEND CONFIGURATION
# =============================================================================
REACT_APP_API_URL=http://localhost:3000
REACT_APP_WS_URL=http://localhost:3000
REACT_APP_ENVIRONMENT=development
GENERATE_SOURCEMAP=true

# =============================================================================
# DATABASE CONFIGURATION
# =============================================================================
# PostgreSQL Database
DATABASE_URL=postgresql://postgres:postgres123@localhost:5432/admetrics
POSTGRES_DB=admetrics
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres123
POSTGRES_PORT=5432

# Database connection pool settings
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_POOL_ACQUIRE_TIMEOUT=60000
DB_POOL_IDLE_TIMEOUT=30000

# =============================================================================
# REDIS CONFIGURATION
# =============================================================================
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis123
REDIS_DB=0

# =============================================================================
# AUTHENTICATION & SECURITY
# =============================================================================
# JWT Secrets (CHANGE THESE IN PRODUCTION!)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-32-chars-minimum
JWT_REFRESH_SECRET=your-refresh-secret-key-change-this-in-production-32-chars-minimum
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Encryption key for sensitive data (32 characters)
ENCRYPTION_KEY=your-32-character-encryption-key-here

# Session configuration
SESSION_SECRET=your-session-secret-key-change-this
SESSION_MAX_AGE=86400000

# Rate limiting
RATE_LIMIT_MAX_REQUESTS=1000
API_RATE_LIMIT=5000
RATE_LIMIT_WINDOW=3600000

# =============================================================================
# GOOGLE ADS API CONFIGURATION
# =============================================================================
GOOGLE_ADS_DEVELOPER_TOKEN=your-google-ads-developer-token
GOOGLE_ADS_CLIENT_ID=your-google-oauth-client-id
GOOGLE_ADS_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_ADS_REFRESH_TOKEN=your-google-refresh-token

# Google Analytics
GOOGLE_ANALYTICS_PROPERTY_ID=your-ga4-property-id

# =============================================================================
# FACEBOOK ADS API CONFIGURATION
# =============================================================================
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_ACCESS_TOKEN=your-long-lived-access-token
FACEBOOK_VERIFY_TOKEN=your-webhook-verify-token

# =============================================================================
# TIKTOK ADS API CONFIGURATION
# =============================================================================
TIKTOK_APP_ID=your-tiktok-app-id
TIKTOK_APP_SECRET=your-tiktok-app-secret
TIKTOK_ACCESS_TOKEN=your-tiktok-access-token

# =============================================================================
# LINKEDIN ADS API CONFIGURATION
# =============================================================================
LINKEDIN_CLIENT_ID=your-linkedin-client-id
LINKEDIN_CLIENT_SECRET=your-linkedin-client-secret
LINKEDIN_ACCESS_TOKEN=your-linkedin-access-token

# =============================================================================
# TWITTER ADS API CONFIGURATION
# =============================================================================
TWITTER_API_KEY=your-twitter-api-key
TWITTER_API_SECRET=your-twitter-api-secret
TWITTER_ACCESS_TOKEN=your-twitter-access-token
TWITTER_ACCESS_TOKEN_SECRET=your-twitter-access-token-secret

# =============================================================================
# SNAPCHAT ADS API CONFIGURATION
# =============================================================================
SNAPCHAT_CLIENT_ID=your-snapchat-client-id
SNAPCHAT_CLIENT_SECRET=your-snapchat-client-secret
SNAPCHAT_ACCESS_TOKEN=your-snapchat-access-token

# =============================================================================
# PINTEREST ADS API CONFIGURATION
# =============================================================================
PINTEREST_APP_ID=your-pinterest-app-id
PINTEREST_APP_SECRET=your-pinterest-app-secret
PINTEREST_ACCESS_TOKEN=your-pinterest-access-token

# =============================================================================
# AI/ML CONFIGURATION
# =============================================================================
# OpenAI API (for advanced AI features)
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4
OPENAI_MAX_TOKENS=2000

# Anthropic Claude API (alternative to OpenAI)
ANTHROPIC_API_KEY=your-anthropic-api-key

# Local AI model settings
AI_ENGINE_URL=http://localhost:5000
MODEL_PATH=./models
ENABLE_GPU=false
ML_BATCH_SIZE=32
ML_LEARNING_RATE=0.001

# =============================================================================
# EMAIL CONFIGURATION
# =============================================================================
# SendGrid (recommended)
SENDGRID_API_KEY=your-sendgrid-api-key
SENDGRID_FROM_EMAIL=noreply@admetrics.ai
SENDGRID_FROM_NAME=AdMetrics

# Alternative email providers
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your-email@gmail.com
# SMTP_PASS=your-app-password
# SMTP_SECURE=true

# =============================================================================
# DATA PIPELINE CONFIGURATION
# =============================================================================
# Sync settings
SYNC_INTERVAL=3600
MAX_CONCURRENT_SYNCS=5
SYNC_BATCH_SIZE=1000
DATA_RETENTION_DAYS=365

# ETL configuration
ETL_SCHEDULE=0 */6 * * *
ETL_BATCH_SIZE=5000
ETL_TIMEOUT=3600000

# =============================================================================
# MONITORING & OBSERVABILITY
# =============================================================================
# Prometheus
PROMETHEUS_PORT=9090

# Grafana
GRAFANA_PORT=3002
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=admin123

# Elasticsearch
ELASTICSEARCH_PORT=9200
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=elastic123

# Kibana
KIBANA_PORT=5601

# =============================================================================
# MESSAGE QUEUE CONFIGURATION
# =============================================================================
# RabbitMQ
RABBITMQ_PORT=5672
RABBITMQ_MANAGEMENT_PORT=15672
RABBITMQ_USER=admin
RABBITMQ_PASSWORD=admin123
RABBITMQ_VHOST=admetrics

# =============================================================================
# OBJECT STORAGE CONFIGURATION
# =============================================================================
# MinIO (S3-compatible)
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123

# AWS S3 (if using AWS instead of MinIO)
# AWS_ACCESS_KEY_ID=your-aws-access-key
# AWS_SECRET_ACCESS_KEY=your-aws-secret-key
# AWS_REGION=us-east-1
# AWS_S3_BUCKET=admetrics-uploads

# =============================================================================
# SSL/TLS CONFIGURATION
# =============================================================================
# SSL certificate paths (for production)
SSL_CERT_PATH=/etc/nginx/ssl/admetrics.crt
SSL_KEY_PATH=/etc/nginx/ssl/admetrics.key
SSL_CA_PATH=/etc/nginx/ssl/ca.crt

# Let's Encrypt settings
LETSENCRYPT_EMAIL=admin@admetrics.ai
LETSENCRYPT_DOMAIN=admetrics.ai

# =============================================================================
# BACKUP CONFIGURATION
# =============================================================================
# Database backup settings
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETENTION_DAYS=30
BACKUP_COMPRESSION=true
BACKUP_S3_BUCKET=admetrics-backups

# =============================================================================
# FEATURE FLAGS
# =============================================================================
# Enable/disable features
ENABLE_API_DOCS=true
ENABLE_SWAGGER=true
ENABLE_REAL_TIME_UPDATES=true
ENABLE_AI_INSIGHTS=true
ENABLE_AUTOMATIC_OPTIMIZATION=false
ENABLE_NOTIFICATIONS=true
ENABLE_WEBHOOKS=true

# Development features
DEV_SEED_DATA=true
HOT_RELOAD=true
DEBUG_MODE=true
MOCK_EXTERNAL_APIS=false

# =============================================================================
# EXTERNAL SERVICES
# =============================================================================
# Webhook URLs
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR/DISCORD/WEBHOOK

# Analytics and tracking
GOOGLE_ANALYTICS_ID=UA-XXXXXXXX-X
MIXPANEL_TOKEN=your-mixpanel-token
SEGMENT_WRITE_KEY=your-segment-write-key

# Error tracking
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# =============================================================================
# PERFORMANCE SETTINGS
# =============================================================================
# Cache settings
CACHE_TTL=300
CACHE_MAX_SIZE=1000
ENABLE_QUERY_CACHE=true

# Request timeout settings
API_TIMEOUT=30000
UPLOAD_TIMEOUT=300000
WEBSOCKET_TIMEOUT=60000

# Concurrency settings
MAX_CONCURRENT_REQUESTS=100
MAX_UPLOAD_SIZE=10485760
MAX_JSON_SIZE=1048576

# =============================================================================
# LOCALIZATION
# =============================================================================
DEFAULT_LANGUAGE=en
SUPPORTED_LANGUAGES=en,es,fr,de,pt
DEFAULT_TIMEZONE=UTC
DEFAULT_CURRENCY=USD

# =============================================================================
# COMPLIANCE & PRIVACY
# =============================================================================
# GDPR compliance
ENABLE_GDPR_MODE=false
DATA_RETENTION_POLICY=365
COOKIE_CONSENT_REQUIRED=true

# Privacy settings
ANONYMIZE_IP_ADDRESSES=true
ENABLE_DATA_EXPORT=true
ENABLE_DATA_DELETION=true

# =============================================================================
# DEVELOPMENT & TESTING
# =============================================================================
# Test database (for automated tests)
TEST_DATABASE_URL=postgresql://postgres:postgres123@localhost:5433/admetrics_test
TEST_REDIS_URL=redis://localhost:6380

# Mock data settings
GENERATE_MOCK_DATA=false
MOCK_DATA_SIZE=1000

# Debug settings
ENABLE_SQL_LOGGING=false
ENABLE_REQUEST_LOGGING=true
ENABLE_PERFORMANCE_MONITORING=true

# =============================================================================
# DEPLOYMENT SETTINGS
# =============================================================================
# Build settings
BUILD_OPTIMIZE=true
BUILD_ANALYZE=false
BUILD_SOURCEMAP=false

# Health check settings
HEALTH_CHECK_INTERVAL=30
HEALTH_CHECK_TIMEOUT=5
HEALTH_CHECK_RETRIES=3

# =============================================================================
# FRONTEND URL CONFIGURATION
# =============================================================================
FRONTEND_URL=http://localhost:3001

# =============================================================================
# NOTES
# =============================================================================
# 1. Change all default passwords and secrets in production
# 2. Use environment-specific files (.env.production, .env.staging)
# 3. Never commit .env files to version control
# 4. Use a secure key management system in production
# 5. Regularly rotate API keys and secrets
# 6. Monitor for any exposed credentials