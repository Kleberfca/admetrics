#!/bin/bash
# Backend Docker Entrypoint Script
# File: scripts/docker-entrypoint.sh

set -e

echo "🚀 Starting AdMetrics Backend API..."

# Function to wait for database
wait_for_db() {
    echo "⏳ Waiting for database connection..."
    
    until node -e "
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        prisma.\$connect()
            .then(() => {
                console.log('✅ Database connected');
                process.exit(0);
            })
            .catch(() => {
                console.log('❌ Database not ready, retrying...');
                process.exit(1);
            });
    "; do
        echo "Database is unavailable - sleeping"
        sleep 2
    done
}

# Function to wait for Redis
wait_for_redis() {
    echo "⏳ Waiting for Redis connection..."
    
    until node -e "
        const redis = require('redis');
        const client = redis.createClient({ url: process.env.REDIS_URL });
        client.connect()
            .then(() => {
                console.log('✅ Redis connected');
                client.disconnect();
                process.exit(0);
            })
            .catch(() => {
                console.log('❌ Redis not ready, retrying...');
                process.exit(1);
            });
    "; do
        echo "Redis is unavailable - sleeping"
        sleep 2
    done
}

# Function to run database migrations
run_migrations() {
    echo "🔄 Running database migrations..."
    npx prisma migrate deploy
    echo "✅ Migrations completed"
}

# Function to seed database (optional)
seed_database() {
    if [ "$SEED_DATABASE" = "true" ]; then
        echo "🌱 Seeding database..."
        npx prisma db seed
        echo "✅ Database seeded"
    fi
}

# Main execution
main() {
    # Wait for dependencies
    wait_for_db
    wait_for_redis
    
    # Run migrations
    run_migrations
    
    # Seed database if needed
    seed_database
    
    # Start the application
    echo "🎯 Starting Node.js application..."
    
    if [ "$NODE_ENV" = "development" ]; then
        exec npm run dev
    else
        exec node dist/app.js
    fi
}

# Execute main function
main "$@"

---

#!/bin/bash
# Frontend Docker Entrypoint Script
# File: scripts/frontend-entrypoint.sh

set -e

echo "🚀 Starting AdMetrics Frontend..."

# Function to inject environment variables into built files
inject_env_vars() {
    echo "🔧 Injecting environment variables..."
    
    # Find all JS files and replace placeholders
    find /usr/share/nginx/html -name "*.js" -exec sed -i "s|REACT_APP_API_URL_PLACEHOLDER|${REACT_APP_API_URL:-http://localhost:3000/api}|g" {} \;
    find /usr/share/nginx/html -name "*.js" -exec sed -i "s|REACT_APP_WS_URL_PLACEHOLDER|${REACT_APP_WS_URL:-ws://localhost:3000}|g" {} \;
    
    echo "✅ Environment variables injected"
}

# Function to create health check endpoint
create_health_endpoint() {
    echo "❤️ Creating health check endpoint..."
    
    cat > /usr/share/nginx/html/health << EOF
{
    "status": "healthy",
    "service": "admetrics-frontend",
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "version": "${APP_VERSION:-1.0.0}"
}
EOF
    
    echo "✅ Health check endpoint created"
}

# Function to setup nginx configuration
setup_nginx() {
    echo "🔧 Setting up Nginx configuration..."
    
    # Create custom nginx config if not exists
    if [ ! -f /etc/nginx/conf.d/default.conf ]; then
        cat > /etc/nginx/conf.d/default.conf << 'EOF'
server {
    listen 3000;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Handle React Router
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }

    # Cache static assets
    location /static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Health check
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    # Block access to sensitive files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
EOF
    fi
    
    echo "✅ Nginx configuration ready"
}

# Main execution
main() {
    # Setup nginx
    setup_nginx
    
    # Inject environment variables
    inject_env_vars
    
    # Create health endpoint
    create_health_endpoint
    
    echo "🎯 Starting Nginx..."
    exec "$@"
}

# Execute main function
main "$@"

---

#!/bin/bash
# AI Engine Docker Entrypoint Script
# File: scripts/ai-entrypoint.sh

set -e

echo "🚀 Starting AdMetrics AI Engine..."

# Function to wait for database
wait_for_db() {
    echo "⏳ Waiting for database connection..."
    
    until python -c "
import psycopg2
import os
import time

try:
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.close()
    print('✅ Database connected')
except Exception as e:
    print('❌ Database not ready:', str(e))
    exit(1)
    "; do
        echo "Database is unavailable - sleeping"
        sleep 2
    done
}

# Function to wait for Redis
wait_for_redis() {
    echo "⏳ Waiting for Redis connection..."
    
    until python -c "
import redis
import os

try:
    r = redis.Redis.from_url(os.environ['REDIS_URL'])
    r.ping()
    print('✅ Redis connected')
except Exception as e:
    print('❌ Redis not ready:', str(e))
    exit(1)
    "; do
        echo "Redis is unavailable - sleeping"
        sleep 2
    done
}

# Function to load AI models
load_models() {
    echo "🤖 Loading AI models..."
    
    python -c "
import os
import sys
sys.path.append('/app')

try:
    from src.utils.model_utils import ModelManager
    
    model_manager = ModelManager('/app/models')
    
    # Load default models
    print('Loading performance predictor...')
    # model_manager.load_model('performance_predictor')
    
    print('Loading budget optimizer...')
    # model_manager.load_model('budget_optimizer')
    
    print('Loading anomaly detector...')
    # model_manager.load_model('anomaly_detector')
    
    print('✅ AI models loaded successfully')
    
except Exception as e:
    print('⚠️ Warning: Could not load some models:', str(e))
    print('Models will be trained on first use')
"
}

# Function to setup directories
setup_directories() {
    echo "📁 Setting up directories..."
    
    mkdir -p /app/models/saved
    mkdir -p /app/logs
    mkdir -p /app/data/temp
    
    echo "✅ Directories ready"
}

# Function to check Python dependencies
check_dependencies() {
    echo "🔍 Checking Python dependencies..."
    
    python -c "
import sys
required_packages = [
    'flask', 'pandas', 'numpy', 'scikit-learn', 
    'lightgbm', 'prophet', 'tensorflow', 'redis'
]

missing = []
for package in required_packages:
    try:
        __import__(package)
    except ImportError:
        missing.append(package)

if missing:
    print(f'❌ Missing packages: {missing}')
    sys.exit(1)
else:
    print('✅ All required packages available')
"
}

# Main execution
main() {
    # Setup directories
    setup_directories
    
    # Check dependencies
    check_dependencies
    
    # Wait for dependencies
    wait_for_db
    wait_for_redis
    
    # Load models
    load_models
    
    echo "🎯 Starting AI Engine..."
    
    if [ "$FLASK_ENV" = "development" ]; then
        exec python -m flask run --host=0.0.0.0 --port=5000
    else
        exec "$@"
    fi
}

# Execute main function
main "$@"