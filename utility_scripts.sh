#!/bin/bash
# scripts/backup.sh - Database Backup Script

set -e

# Configuration
BACKUP_DIR="/backups"
RETENTION_DAYS=30
DATABASE_URL=${DATABASE_URL:-"postgresql://postgres:postgres123@localhost:5432/admetrics"}
REDIS_URL=${REDIS_URL:-"redis://localhost:6379"}
S3_BUCKET=${S3_BUCKET:-"admetrics-backups"}
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create backup directory
mkdir -p "${BACKUP_DIR}"

backup_postgres() {
    log_info "Starting PostgreSQL backup..."
    
    BACKUP_FILE="${BACKUP_DIR}/postgres_backup_${TIMESTAMP}.sql"
    
    if pg_dump "${DATABASE_URL}" > "${BACKUP_FILE}"; then
        log_info "PostgreSQL backup completed: ${BACKUP_FILE}"
        
        # Compress backup
        gzip "${BACKUP_FILE}"
        log_info "Backup compressed: ${BACKUP_FILE}.gz"
        
        # Upload to S3 if configured
        if [ -n "${S3_BUCKET}" ] && command -v aws >/dev/null 2>&1; then
            if aws s3 cp "${BACKUP_FILE}.gz" "s3://${S3_BUCKET}/postgres/"; then
                log_info "Backup uploaded to S3"
            else
                log_warning "Failed to upload backup to S3"
            fi
        fi
        
        return 0
    else
        log_error "PostgreSQL backup failed"
        return 1
    fi
}

backup_redis() {
    log_info "Starting Redis backup..."
    
    BACKUP_FILE="${BACKUP_DIR}/redis_backup_${TIMESTAMP}.rdb"
    
    if redis-cli -u "${REDIS_URL}" --rdb "${BACKUP_FILE}"; then
        log_info "Redis backup completed: ${BACKUP_FILE}"
        
        # Compress backup
        gzip "${BACKUP_FILE}"
        log_info "Backup compressed: ${BACKUP_FILE}.gz"
        
        # Upload to S3 if configured
        if [ -n "${S3_BUCKET}" ] && command -v aws >/dev/null 2>&1; then
            if aws s3 cp "${BACKUP_FILE}.gz" "s3://${S3_BUCKET}/redis/"; then
                log_info "Redis backup uploaded to S3"
            else
                log_warning "Failed to upload Redis backup to S3"
            fi
        fi
        
        return 0
    else
        log_error "Redis backup failed"
        return 1
    fi
}

backup_models() {
    log_info "Starting AI models backup..."
    
    MODEL_DIR="${MODEL_DIR:-./ai-engine/models}"
    BACKUP_FILE="${BACKUP_DIR}/models_backup_${TIMESTAMP}.tar.gz"
    
    if [ -d "${MODEL_DIR}" ]; then
        if tar -czf "${BACKUP_FILE}" -C "${MODEL_DIR}" .; then
            log_info "AI models backup completed: ${BACKUP_FILE}"
            
            # Upload to S3 if configured
            if [ -n "${S3_BUCKET}" ] && command -v aws >/dev/null 2>&1; then
                if aws s3 cp "${BACKUP_FILE}" "s3://${S3_BUCKET}/models/"; then
                    log_info "Models backup uploaded to S3"
                else
                    log_warning "Failed to upload models backup to S3"
                fi
            fi
            
            return 0
        else
            log_error "AI models backup failed"
            return 1
        fi
    else
        log_warning "Model directory not found: ${MODEL_DIR}"
        return 0
    fi
}

cleanup_old_backups() {
    log_info "Cleaning up old backups (older than ${RETENTION_DAYS} days)..."
    
    find "${BACKUP_DIR}" -name "*.gz" -type f -mtime +${RETENTION_DAYS} -delete
    
    # Cleanup S3 backups if configured
    if [ -n "${S3_BUCKET}" ] && command -v aws >/dev/null 2>&1; then
        CUTOFF_DATE=$(date -d "${RETENTION_DAYS} days ago" +%Y-%m-%d)
        aws s3 ls "s3://${S3_BUCKET}/" --recursive | while read -r line; do
            FILE_DATE=$(echo "$line" | awk '{print $1}')
            FILE_PATH=$(echo "$line" | awk '{print $4}')
            
            if [[ "$FILE_DATE" < "$CUTOFF_DATE" ]]; then
                aws s3 rm "s3://${S3_BUCKET}/${FILE_PATH}"
                log_info "Deleted old S3 backup: ${FILE_PATH}"
            fi
        done
    fi
    
    log_info "Cleanup completed"
}

main() {
    log_info "Starting AdMetrics backup process..."
    
    local exit_code=0
    
    # Backup PostgreSQL
    if ! backup_postgres; then
        exit_code=1
    fi
    
    # Backup Redis
    if ! backup_redis; then
        exit_code=1
    fi
    
    # Backup AI models
    if ! backup_models; then
        exit_code=1
    fi
    
    # Cleanup old backups
    cleanup_old_backups
    
    if [ $exit_code -eq 0 ]; then
        log_info "All backups completed successfully"
    else
        log_error "Some backups failed"
    fi
    
    return $exit_code
}

# Run main function
main "$@"

---

#!/bin/bash
# scripts/health-check.sh - Comprehensive Health Check Script

set -e

# Configuration
BACKEND_URL=${BACKEND_URL:-"http://localhost:3000"}
FRONTEND_URL=${FRONTEND_URL:-"http://localhost:3001"}
AI_ENGINE_URL=${AI_ENGINE_URL:-"http://localhost:5000"}
DATABASE_URL=${DATABASE_URL:-"postgresql://postgres:postgres123@localhost:5432/admetrics"}
REDIS_URL=${REDIS_URL:-"redis://localhost:6379"}
TIMEOUT=10

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Health check results
OVERALL_STATUS="healthy"
CHECKS_PASSED=0
CHECKS_TOTAL=0

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_service() {
    local service_name="$1"
    local url="$2"
    local expected_status="${3:-200}"
    
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
    
    log_info "Checking ${service_name}..."
    
    if response=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "$url"); then
        if [ "$response" = "$expected_status" ]; then
            log_info "✅ ${service_name} is healthy (HTTP $response)"
            CHECKS_PASSED=$((CHECKS_PASSED + 1))
            return 0
        else
            log_error "❌ ${service_name} returned HTTP $response (expected $expected_status)"
            OVERALL_STATUS="unhealthy"
            return 1
        fi
    else
        log_error "❌ ${service_name} is unreachable"
        OVERALL_STATUS="unhealthy"
        return 1
    fi
}

check_database() {
    local service_name="PostgreSQL Database"
    
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
    
    log_info "Checking ${service_name}..."
    
    if pg_isready -d "$DATABASE_URL" >/dev/null 2>&1; then
        log_info "✅ ${service_name} is healthy"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
        return 0
    else
        log_error "❌ ${service_name} is unreachable"
        OVERALL_STATUS="unhealthy"
        return 1
    fi
}

check_redis() {
    local service_name="Redis Cache"
    
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
    
    log_info "Checking ${service_name}..."
    
    if redis-cli -u "$REDIS_URL" ping >/dev/null 2>&1; then
        log_info "✅ ${service_name} is healthy"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
        return 0
    else
        log_error "❌ ${service_name} is unreachable"
        OVERALL_STATUS="unhealthy"
        return 1
    fi
}

check_api_endpoints() {
    log_info "Checking critical API endpoints..."
    
    # Backend health endpoint
    check_service "Backend API" "${BACKEND_URL}/health"
    
    # AI Engine health endpoint
    check_service "AI Engine" "${AI_ENGINE_URL}/health"
    
    # Check specific API functionality
    if command -v jq >/dev/null 2>&1; then
        CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
        
        if response=$(curl -s --max-time $TIMEOUT "${BACKEND_URL}/health"); then
            if echo "$response" | jq -e '.status == "OK"' >/dev/null 2>&1; then
                log_info "✅ Backend API health check passed"
                CHECKS_PASSED=$((CHECKS_PASSED + 1))
            else
                log_error "❌ Backend API health check failed"
                OVERALL_STATUS="unhealthy"
            fi
        else
            log_error "❌ Backend API health check failed"
            OVERALL_STATUS="unhealthy"
        fi
    fi
}

check_frontend() {
    log_info "Checking frontend availability..."
    
    # Check if frontend is serving content
    check_service "Frontend" "${FRONTEND_URL}" "200"
    
    # Check if main assets are available
    check_service "Frontend Assets" "${FRONTEND_URL}/static/js" "404"  # 404 is expected for directory listing
}

check_disk_space() {
    log_info "Checking disk space..."
    
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
    
    # Check available disk space (warn if less than 10% free)
    DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    
    if [ "$DISK_USAGE" -lt 90 ]; then
        log_info "✅ Disk space is healthy (${DISK_USAGE}% used)"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    else
        log_warning "⚠️ Disk space is running low (${DISK_USAGE}% used)"
        if [ "$DISK_USAGE" -gt 95 ]; then
            OVERALL_STATUS="unhealthy"
        fi
    fi
}

check_memory() {
    log_info "Checking memory usage..."
    
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
    
    # Check memory usage
    if command -v free >/dev/null 2>&1; then
        MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
        
        if [ "$MEMORY_USAGE" -lt 85 ]; then
            log_info "✅ Memory usage is healthy (${MEMORY_USAGE}% used)"
            CHECKS_PASSED=$((CHECKS_PASSED + 1))
        else
            log_warning "⚠️ Memory usage is high (${MEMORY_USAGE}% used)"
            if [ "$MEMORY_USAGE" -gt 95 ]; then
                OVERALL_STATUS="unhealthy"
            fi
        fi
    else
        log_warning "⚠️ Cannot check memory usage (free command not available)"
    fi
}

check_docker_containers() {
    if command -v docker >/dev/null 2>&1; then
        log_info "Checking Docker containers..."
        
        CONTAINER_NAMES=("admetrics_backend" "admetrics_frontend" "admetrics_ai" "admetrics_postgres" "admetrics_redis")
        
        for container in "${CONTAINER_NAMES[@]}"; do
            CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
            
            if docker ps --filter "name=${container}" --filter "status=running" | grep -q "${container}"; then
                log_info "✅ Container ${container} is running"
                CHECKS_PASSED=$((CHECKS_PASSED + 1))
            else
                log_error "❌ Container ${container} is not running"
                OVERALL_STATUS="unhealthy"
            fi
        done
    fi
}

print_summary() {
    echo ""
    echo "========================================"
    echo "           HEALTH CHECK SUMMARY"
    echo "========================================"
    echo "Overall Status: $OVERALL_STATUS"
    echo "Checks Passed: $CHECKS_PASSED/$CHECKS_TOTAL"
    echo "========================================"
    
    if [ "$OVERALL_STATUS" = "healthy" ]; then
        echo -e "${GREEN}🎉 All systems are operational!${NC}"
        return 0
    else
        echo -e "${RED}⚠️ Some systems need attention!${NC}"
        return 1
    fi
}

main() {
    echo "🏥 AdMetrics Health Check"
    echo "========================"
    echo ""
    
    # Infrastructure checks
    check_database
    check_redis
    
    # Application checks
    check_api_endpoints
    check_frontend
    
    # System checks
    check_disk_space
    check_memory
    
    # Container checks (if available)
    check_docker_containers
    
    # Print summary
    print_summary
}

# Run health check
main "$@"

---

#!/bin/bash
# scripts/deploy.sh - Deployment Script

set -e

# Configuration
ENVIRONMENT=${1:-"staging"}
VERSION=${2:-"latest"}
NAMESPACE="admetrics"
DOCKER_REGISTRY=${DOCKER_REGISTRY:-"admetrics"}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check required tools
    local tools=("docker" "kubectl" "helm")
    for tool in "${tools[@]}"; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            log_error "$tool is not installed"
            exit 1
        fi
    done
    
    # Check kubectl context
    if ! kubectl cluster-info >/dev/null 2>&1; then
        log_error "kubectl is not configured or cluster is unreachable"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

build_images() {
    log_info "Building Docker images..."
    
    # Build backend
    log_info "Building backend image..."
    docker build -t "${DOCKER_REGISTRY}/backend:${VERSION}" ./backend
    
    # Build frontend
    log_info "Building frontend image..."
    docker build -t "${DOCKER_REGISTRY}/frontend:${VERSION}" ./frontend
    
    # Build AI engine
    log_info "Building AI engine image..."
    docker build -t "${DOCKER_REGISTRY}/ai-engine:${VERSION}" ./ai-engine
    
    log_success "Docker images built successfully"
}

push_images() {
    log_info "Pushing Docker images to registry..."
    
    docker push "${DOCKER_REGISTRY}/backend:${VERSION}"
    docker push "${DOCKER_REGISTRY}/frontend:${VERSION}"
    docker push "${DOCKER_REGISTRY}/ai-engine:${VERSION}"
    
    log_success "Docker images pushed successfully"
}

create_namespace() {
    log_info "Creating namespace if it doesn't exist..."
    
    if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
        kubectl create namespace "$NAMESPACE"
        log_success "Namespace $NAMESPACE created"
    else
        log_info "Namespace $NAMESPACE already exists"
    fi
}

deploy_with_helm() {
    log_info "Deploying with Helm..."
    
    local values_file="helm/admetrics/values-${ENVIRONMENT}.yaml"
    
    if [ ! -f "$values_file" ]; then
        log_warning "Values file not found: $values_file, using default values"
        values_file="helm/admetrics/values.yaml"
    fi
    
    helm upgrade --install admetrics-${ENVIRONMENT} ./helm/admetrics \
        --namespace "$NAMESPACE" \
        --values "$values_file" \
        --set image.tag="$VERSION" \
        --set environment="$ENVIRONMENT" \
        --wait \
        --timeout=10m
    
    log_success "Helm deployment completed"
}

deploy_with_kubectl() {
    log_info "Deploying with kubectl..."
    
    # Apply configurations
    kubectl apply -f infrastructure/kubernetes/namespace.yaml
    kubectl apply -f infrastructure/kubernetes/configmap.yaml
    kubectl apply -f infrastructure/kubernetes/secret.yaml
    kubectl apply -f infrastructure/kubernetes/pvc.yaml
    
    # Deploy services
    kubectl apply -f infrastructure/kubernetes/postgres-deployment.yaml
    kubectl apply -f infrastructure/kubernetes/redis-deployment.yaml
    kubectl apply -f infrastructure/kubernetes/backend-deployment.yaml
    kubectl apply -f infrastructure/kubernetes/frontend-deployment.yaml
    kubectl apply -f infrastructure/kubernetes/ai-engine-deployment.yaml
    
    # Apply services and ingress
    kubectl apply -f infrastructure/kubernetes/services.yaml
    kubectl apply -f infrastructure/kubernetes/ingress.yaml
    kubectl apply -f infrastructure/kubernetes/hpa.yaml
    
    # Update image tags
    kubectl set image deployment/admetrics-backend backend="${DOCKER_REGISTRY}/backend:${VERSION}" -n "$NAMESPACE"
    kubectl set image deployment/admetrics-frontend frontend="${DOCKER_REGISTRY}/frontend:${VERSION}" -n "$NAMESPACE"
    kubectl set image deployment/admetrics-ai-engine ai-engine="${DOCKER_REGISTRY}/ai-engine:${VERSION}" -n "$NAMESPACE"
    
    # Wait for rollout
    kubectl rollout status deployment/admetrics-backend -n "$NAMESPACE" --timeout=300s
    kubectl rollout status deployment/admetrics-frontend -n "$NAMESPACE" --timeout=300s
    kubectl rollout status deployment/admetrics-ai-engine -n "$NAMESPACE" --timeout=300s
    
    log_success "kubectl deployment completed"
}

run_smoke_tests() {
    log_info "Running smoke tests..."
    
    # Get service URLs
    if [ "$ENVIRONMENT" = "production" ]; then
        FRONTEND_URL="https://dashboard.admetrics.ai"
        BACKEND_URL="https://api.admetrics.ai"
    else
        # Port forward for testing
        kubectl port-forward service/admetrics-frontend-service 8080:3000 -n "$NAMESPACE" &
        FRONTEND_PID=$!
        kubectl port-forward service/admetrics-backend-service 8081:3000 -n "$NAMESPACE" &
        BACKEND_PID=$!
        
        sleep 10
        
        FRONTEND_URL="http://localhost:8080"
        BACKEND_URL="http://localhost:8081"
    fi
    
    # Test frontend
    if curl -f "$FRONTEND_URL" >/dev/null 2>&1; then
        log_success "Frontend smoke test passed"
    else
        log_error "Frontend smoke test failed"
        return 1
    fi
    
    # Test backend API
    if curl -f "$BACKEND_URL/health" >/dev/null 2>&1; then
        log_success "Backend smoke test passed"
    else
        log_error "Backend smoke test failed"
        return 1
    fi
    
    # Cleanup port forwards
    if [ -n "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID >/dev/null 2>&1 || true
    fi
    if [ -n "$BACKEND_PID" ]; then
        kill $BACKEND_PID >/dev/null 2>&1 || true
    fi
    
    log_success "Smoke tests completed"
}

rollback() {
    log_warning "Rolling back deployment..."
    
    if command -v helm >/dev/null 2>&1; then
        helm rollback admetrics-${ENVIRONMENT} -n "$NAMESPACE"
    else
        kubectl rollout undo deployment/admetrics-backend -n "$NAMESPACE"
        kubectl rollout undo deployment/admetrics-frontend -n "$NAMESPACE"
        kubectl rollout undo deployment/admetrics-ai-engine -n "$NAMESPACE"
    fi
    
    log_success "Rollback completed"
}

main() {
    echo "🚀 AdMetrics Deployment Script"
    echo "Environment: $ENVIRONMENT"
    echo "Version: $VERSION"
    echo "=============================="
    echo ""
    
    # Check prerequisites
    check_prerequisites
    
    # Build and push images
    if [ "$VERSION" != "latest" ]; then
        build_images
        push_images
    fi
    
    # Create namespace
    create_namespace
    
    # Deploy
    if command -v helm >/dev/null 2>&1 && [ -d "helm/admetrics" ]; then
        deploy_with_helm
    else
        deploy_with_kubectl
    fi
    
    # Run smoke tests
    if ! run_smoke_tests; then
        log_error "Smoke tests failed, rolling back..."
        rollback
        exit 1
    fi
    
    log_success "🎉 Deployment completed successfully!"
    echo ""
    echo "Access your application:"
    if [ "$ENVIRONMENT" = "production" ]; then
        echo "Frontend: https://dashboard.admetrics.ai"
        echo "API: https://api.admetrics.ai"
    else
        echo "Use kubectl port-forward to access services locally"
    fi
}

# Show usage if no arguments
if [ $# -eq 0 ]; then
    echo "Usage: $0 <environment> [version]"
    echo "  environment: staging, production"
    echo "  version: Docker image tag (default: latest)"
    echo ""
    echo "Examples:"
    echo "  $0 staging"
    echo "  $0 production v1.2.3"
    exit 1
fi

# Run deployment
main "$@"

---

#!/bin/bash
# scripts/dev-setup.sh - Development Environment Setup

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

setup_git_hooks() {
    log_info "Setting up Git hooks..."
    
    # Install husky for Git hooks
    if [ -f "package.json" ]; then
        npm install --save-dev husky lint-staged
        npx husky install
        
        # Pre-commit hook
        npx husky add .husky/pre-commit "npx lint-staged"
        
        # Commit message hook
        npx husky add .husky/commit-msg 'npx --no -- commitlint --edit "$1"'
        
        # Create lint-staged config
        cat > .lintstagedrc.json << 'EOF'
{
  "*.{js,jsx,ts,tsx}": [
    "eslint --fix",
    "prettier --write"
  ],
  "*.{css,scss,md,json}": [
    "prettier --write"
  ],
  "*.py": [
    "black --check",
    "flake8"
  ]
}
EOF
        
        log_success "Git hooks configured"
    else
        log_warning "package.json not found, skipping Git hooks setup"
    fi
}

setup_vscode() {
    log_info "Setting up VS Code configuration..."
    
    mkdir -p .vscode
    
    # Settings
    cat > .vscode/settings.json << 'EOF'
{
  "typescript.preferences.includePackageJsonAutoImports": "auto",
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  "python.defaultInterpreterPath": "./ai-engine/venv/bin/python",
  "python.formatting.provider": "black",
  "python.linting.enabled": true,
  "python.linting.flake8Enabled": true,
  "eslint.workingDirectories": ["backend", "frontend"],
  "typescript.preferences.importModuleSpecifier": "relative",
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/build": true,
    "**/.git": true,
    "**/__pycache__": true,
    "**/*.pyc": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/build": true,
    "**/__pycache__": true
  }
}
EOF

    # Extensions
    cat > .vscode/extensions.json << 'EOF'
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "ms-python.python",
    "ms-python.black-formatter",
    "ms-python.flake8",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next",
    "ms-vscode.vscode-json",
    "ms-kubernetes-tools.vscode-kubernetes-tools",
    "ms-vscode.docker",
    "redhat.vscode-yaml",
    "ms-vscode.vscode-eslint"
  ]
}
EOF

    # Tasks
    cat > .vscode/tasks.json << 'EOF'
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Start Backend Dev",
      "type": "shell",
      "command": "npm run dev",
      "options": {
        "cwd": "${workspaceFolder}/backend"
      },
      "group": "build",
      "presentation": {
        "reveal": "always",
        "panel": "new"
      }
    },
    {
      "label": "Start Frontend Dev",
      "type": "shell",
      "command": "npm start",
      "options": {
        "cwd": "${workspaceFolder}/frontend"
      },
      "group": "build",
      "presentation": {
        "reveal": "always",
        "panel": "new"
      }
    },
    {
      "label": "Start AI Engine Dev",
      "type": "shell",
      "command": "source venv/bin/activate && python src/api/app.py",
      "options": {
        "cwd": "${workspaceFolder}/ai-engine"
      },
      "group": "build",
      "presentation": {
        "reveal": "always",
        "panel": "new"
      }
    },
    {
      "label": "Run All Tests",
      "type": "shell",
      "command": "npm run test:all",
      "group": "test",
      "presentation": {
        "reveal": "always"
      }
    },
    {
      "label": "Docker Compose Up",
      "type": "shell",
      "command": "docker-compose up -d",
      "group": "build",
      "presentation": {
        "reveal": "always"
      }
    }
  ]
}
EOF

    # Launch configurations
    cat > .vscode/launch.json << 'EOF'
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Backend",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/backend/src/app.ts",
      "outFiles": ["${workspaceFolder}/backend/dist/**/*.js"],
      "runtimeArgs": ["-r", "ts-node/register"],
      "env": {
        "NODE_ENV": "development"
      },
      "envFile": "${workspaceFolder}/.env",
      "console": "integratedTerminal",
      "restart": true,
      "runtimeVersion": "18"
    },
    {
      "name": "Debug AI Engine",
      "type": "python",
      "request": "launch",
      "program": "${workspaceFolder}/ai-engine/src/api/app.py",
      "cwd": "${workspaceFolder}/ai-engine",
      "env": {
        "FLASK_ENV": "development",
        "FLASK_DEBUG": "1"
      },
      "envFile": "${workspaceFolder}/.env",
      "console": "integratedTerminal"
    }
  ]
}
EOF

    log_success "VS Code configuration created"
}

create_dev_scripts() {
    log_info "Creating development scripts..."
    
    # Create scripts directory
    mkdir -p scripts/dev
    
    # Start all services script
    cat > scripts/dev/start-all.sh << 'EOF'
#!/bin/bash
echo "🚀 Starting all AdMetrics services..."

# Start infrastructure
docker-compose up -d postgres redis

# Wait for services
sleep 5

# Start backend in background
cd backend && npm run dev &
BACKEND_PID=$!

# Start frontend in background
cd ../frontend && npm start &
FRONTEND_PID=$!

# Start AI engine in background
cd ../ai-engine && source venv/bin/activate && python src/api/app.py &
AI_PID=$!

echo "✅ All services started!"
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "AI Engine PID: $AI_PID"

# Wait for user input to stop
read -p "Press Enter to stop all services..."

# Kill background processes
kill $BACKEND_PID $FRONTEND_PID $AI_PID 2>/dev/null || true
docker-compose stop

echo "🛑 All services stopped"
EOF

    # Reset database script
    cat > scripts/dev/reset-db.sh << 'EOF'
#!/bin/bash
echo "🔄 Resetting database..."

cd backend

# Reset Prisma database
npx prisma migrate reset --force

# Run migrations
npx prisma migrate dev

# Seed database
npx prisma db seed

echo "✅ Database reset complete"
EOF

    # Generate sample data script
    cat > scripts/dev/generate-sample-data.sh << 'EOF'
#!/bin/bash
echo "📊 Generating sample data..."

cd backend
npm run seed:sample

echo "✅ Sample data generated"
EOF

    # Make scripts executable
    chmod +x scripts/dev/*.sh
    
    log_success "Development scripts created"
}

setup_env_files() {
    log_info "Setting up environment files..."
    
    if [ ! -f ".env" ]; then
        cp .env.example .env
        log_success "Created .env file from template"
        log_warning "Please update .env with your configuration"
    else
        log_info ".env file already exists"
    fi
    
    # Create environment-specific files
    for env in development testing staging; do
        if [ ! -f ".env.${env}" ]; then
            cp .env.example ".env.${env}"
            sed -i "s/NODE_ENV=development/NODE_ENV=${env}/" ".env.${env}"
            log_success "Created .env.${env} file"
        fi
    done
}

install_dependencies() {
    log_info "Installing project dependencies..."
    
    # Backend dependencies
    if [ -d "backend" ]; then
        log_info "Installing backend dependencies..."
        cd backend && npm install && cd ..
    fi
    
    # Frontend dependencies
    if [ -d "frontend" ]; then
        log_info "Installing frontend dependencies..."
        cd frontend && npm install && cd ..
    fi
    
    # AI Engine dependencies
    if [ -d "ai-engine" ]; then
        log_info "Installing AI engine dependencies..."
        cd ai-engine
        if [ ! -d "venv" ]; then
            python3 -m venv venv
        fi
        source venv/bin/activate
        pip install --upgrade pip
        pip install -r requirements.txt
        cd ..
    fi
    
    log_success "Dependencies installed"
}

main() {
    echo "🛠️ AdMetrics Development Setup"
    echo "============================="
    echo ""
    
    setup_env_files
    install_dependencies
    setup_git_hooks
    setup_vscode
    create_dev_scripts
    
    echo ""
    log_success "🎉 Development environment setup complete!"
    echo ""
    echo "Next steps:"
    echo "1. Update .env file with your configuration"
    echo "2. Run 'docker-compose up -d' to start infrastructure"
    echo "3. Run 'scripts/dev/start-all.sh' to start all services"
    echo "4. Open the project in VS Code for the best experience"
}

main "$@"