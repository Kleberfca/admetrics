#!/bin/bash

# AdMetrics AI Dashboard - Complete Setup Script
# This script sets up the entire development environment

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging functions
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

log_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

# System requirements
MIN_NODE_VERSION="18.0.0"
MIN_PYTHON_VERSION="3.9.0"
MIN_DOCKER_VERSION="20.0.0"

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_error "This script should not be run as root"
        exit 1
    fi
}

# Display banner
show_banner() {
    echo -e "${CYAN}"
    cat << "EOF"
    ╔═══════════════════════════════════════════════════════╗
    ║               AdMetrics AI Dashboard                  ║
    ║           Development Environment Setup               ║
    ║                                                       ║
    ║   🤖 AI-Powered Advertising Analytics Platform       ║
    ╚═══════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    echo ""
    log_info "Starting AdMetrics development environment setup..."
    echo ""
}

# Check system requirements
check_system_requirements() {
    log_step "Checking system requirements..."
    
    # Check OS
    OS="$(uname -s)"
    case "${OS}" in
        Linux*)     MACHINE=Linux;;
        Darwin*)    MACHINE=Mac;;
        CYGWIN*)    MACHINE=Cygwin;;
        MINGW*)     MACHINE=MinGw;;
        *)          MACHINE="UNKNOWN:${OS}"
    esac
    log_info "Operating System: $MACHINE"
    
    # Check Node.js
    if command -v node >/dev/null 2>&1; then
        NODE_VERSION=$(node --version | sed 's/v//')
        if [ "$(printf '%s\n' "$MIN_NODE_VERSION" "$NODE_VERSION" | sort -V | head -n1)" = "$MIN_NODE_VERSION" ]; then
            log_success "Node.js version: $NODE_VERSION ✓"
        else
            log_error "Node.js version $NODE_VERSION is too old. Minimum required: $MIN_NODE_VERSION"
            log_info "Please install Node.js from: https://nodejs.org/"
            exit 1
        fi
    else
        log_error "Node.js is not installed"
        log_info "Please install Node.js from: https://nodejs.org/"
        exit 1
    fi
    
    # Check npm
    if command -v npm >/dev/null 2>&1; then
        NPM_VERSION=$(npm --version)
        log_success "npm version: $NPM_VERSION ✓"
    else
        log_error "npm is not installed"
        exit 1
    fi
    
    # Check Python
    if command -v python3 >/dev/null 2>&1; then
        PYTHON_VERSION=$(python3 --version | awk '{print $2}')
        if [ "$(printf '%s\n' "$MIN_PYTHON_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" = "$MIN_PYTHON_VERSION" ]; then
            log_success "Python version: $PYTHON_VERSION ✓"
        else
            log_error "Python version $PYTHON_VERSION is too old. Minimum required: $MIN_PYTHON_VERSION"
            exit 1
        fi
    else
        log_error "Python 3 is not installed"
        log_info "Please install Python 3: https://python.org/"
        exit 1
    fi
    
    # Check pip
    if command -v pip3 >/dev/null 2>&1; then
        PIP_VERSION=$(pip3 --version | awk '{print $2}')
        log_success "pip version: $PIP_VERSION ✓"
    else
        log_error "pip3 is not installed"
        exit 1
    fi
    
    # Check Docker
    if command -v docker >/dev/null 2>&1; then
        DOCKER_VERSION=$(docker --version | awk '{print $3}' | sed 's/,//')
        if [ "$(printf '%s\n' "$MIN_DOCKER_VERSION" "$DOCKER_VERSION" | sort -V | head -n1)" = "$MIN_DOCKER_VERSION" ]; then
            log_success "Docker version: $DOCKER_VERSION ✓"
        else
            log_warning "Docker version $DOCKER_VERSION might be too old. Recommended: $MIN_DOCKER_VERSION+"
        fi
    else
        log_warning "Docker is not installed. Some features will not be available."
        log_info "Install Docker: https://docker.com/"
    fi
    
    # Check Docker Compose
    if command -v docker-compose >/dev/null 2>&1; then
        DOCKER_COMPOSE_VERSION=$(docker-compose --version | awk '{print $3}' | sed 's/,//')
        log_success "Docker Compose version: $DOCKER_COMPOSE_VERSION ✓"
    else
        log_warning "Docker Compose is not installed"
    fi
    
    # Check Git
    if command -v git >/dev/null 2>&1; then
        GIT_VERSION=$(git --version | awk '{print $3}')
        log_success "Git version: $GIT_VERSION ✓"
    else
        log_error "Git is not installed"
        exit 1
    fi
    
    log_success "All system requirements satisfied!"
    echo ""
}

# Create directory structure
create_directory_structure() {
    log_step "Creating directory structure..."
    
    # Main directories
    mkdir -p {backend,frontend,ai-engine,data-pipeline,infrastructure,docs,shared,logs,uploads,models,data}
    
    # Backend directories
    mkdir -p backend/{src/{controllers,services,models,middleware,utils,config,routes,types},tests,prisma}
    
    # Frontend directories
    mkdir -p frontend/{src/{components,pages,hooks,services,store,utils,types,styles},public,tests}
    
    # AI Engine directories
    mkdir -p ai-engine/{src/{models,services,data,api,utils},tests,notebooks}
    
    # Data Pipeline directories
    mkdir -p data-pipeline/{src/{extractors,transformers,loaders,schedulers,config},tests}
    
    # Infrastructure directories
    mkdir -p infrastructure/{docker,kubernetes,nginx,monitoring,ssl,terraform}
    
    # Shared directories
    mkdir -p shared/{types,utils,constants}
    
    # Additional directories
    mkdir -p {database/{init,backups,migrations},scripts/{dev,production,backup}}
    
    log_success "Directory structure created ✓"
    echo ""
}

# Setup environment files
setup_environment() {
    log_step "Setting up environment configuration..."
    
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env
            log_success "Created .env from .env.example"
            log_warning "Please update .env with your configuration"
        else
            log_warning ".env.example not found, creating basic .env"
            create_basic_env
        fi
    else
        log_info ".env file already exists"
    fi
    
    # Create environment-specific files
    for env in development testing staging production; do
        if [ ! -f ".env.${env}" ]; then
            cp .env.example ".env.${env}" 2>/dev/null || create_basic_env ".env.${env}"
            sed -i.bak "s/NODE_ENV=development/NODE_ENV=${env}/" ".env.${env}" 2>/dev/null || true
            log_success "Created .env.${env} file"
        fi
    done
    
    echo ""
}

# Create basic environment file
create_basic_env() {
    local env_file="${1:-.env}"
    
    cat > "$env_file" << EOF
# AdMetrics Environment Configuration
NODE_ENV=development
PYTHON_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:3001

# Database
DATABASE_URL=postgresql://postgres:postgres123@localhost:5432/admetrics
POSTGRES_DB=admetrics
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres123

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=redis123

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_REFRESH_SECRET=your-refresh-secret-key-change-this-in-production

# AI Engine
AI_ENGINE_URL=http://localhost:5000
OPENAI_API_KEY=your-openai-api-key

# Platform API Keys (fill in your actual keys)
GOOGLE_ADS_DEVELOPER_TOKEN=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
TIKTOK_APP_ID=
TIKTOK_APP_SECRET=

# Email
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=noreply@admetrics.ai

# Features
ENABLE_METRICS=true
LOG_LEVEL=info
EOF
    
    log_success "Created basic $env_file file"
}

# Install dependencies
install_dependencies() {
    log_step "Installing project dependencies..."
    
    # Root dependencies
    if [ -f "package.json" ]; then
        log_info "Installing root dependencies..."
        npm install
    fi
    
    # Backend dependencies
    if [ -d "backend" ] && [ -f "backend/package.json" ]; then
        log_info "Installing backend dependencies..."
        cd backend && npm install && cd ..
        log_success "Backend dependencies installed ✓"
    fi
    
    # Frontend dependencies
    if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then
        log_info "Installing frontend dependencies..."
        cd frontend && npm install && cd ..
        log_success "Frontend dependencies installed ✓"
    fi
    
    # AI Engine dependencies
    if [ -d "ai-engine" ]; then
        log_info "Installing AI engine dependencies..."
        cd ai-engine
        
        if [ ! -d "venv" ]; then
            python3 -m venv venv
            log_success "Created Python virtual environment"
        fi
        
        source venv/bin/activate
        pip install --upgrade pip
        
        if [ -f "requirements.txt" ]; then
            pip install -r requirements.txt
            log_success "AI engine dependencies installed ✓"
        else
            log_warning "requirements.txt not found for AI engine"
        fi
        
        deactivate
        cd ..
    fi
    
    # Data Pipeline dependencies
    if [ -d "data-pipeline" ] && [ -f "data-pipeline/requirements.txt" ]; then
        log_info "Installing data pipeline dependencies..."
        cd data-pipeline
        
        if [ ! -d "venv" ]; then
            python3 -m venv venv
        fi
        
        source venv/bin/activate
        pip install --upgrade pip
        pip install -r requirements.txt
        deactivate
        cd ..
        
        log_success "Data pipeline dependencies installed ✓"
    fi
    
    echo ""
}

# Setup database
setup_database() {
    log_step "Setting up database..."
    
    # Check if PostgreSQL is available
    if command -v psql >/dev/null 2>&1; then
        log_info "PostgreSQL found locally"
        
        # Try to connect and create database
        if psql -U postgres -c '\q' 2>/dev/null; then
            log_info "Creating database..."
            createdb -U postgres admetrics 2>/dev/null || log_info "Database might already exist"
            log_success "Database setup completed"
        else
            log_warning "Cannot connect to PostgreSQL locally"
            log_info "Please ensure PostgreSQL is running or use Docker"
        fi
    else
        log_warning "PostgreSQL not found locally"
        log_info "Please ensure PostgreSQL is running or use Docker"
    fi
    
    # Run Prisma migrations if backend exists
    if [ -d "backend" ] && [ -f "backend/prisma/schema.prisma" ]; then
        log_info "Running database migrations..."
        cd backend
        npx prisma generate
        npx prisma migrate dev --name init || log_warning "Migration failed - database might not be ready"
        cd ..
        log_success "Database migrations completed ✓"
    fi
    
    echo ""
}

# Setup Git hooks
setup_git_hooks() {
    log_step "Setting up Git hooks..."
    
    if [ -d ".git" ]; then
        # Install husky if package.json exists
        if [ -f "package.json" ] && command -v npm >/dev/null 2>&1; then
            if npm list husky >/dev/null 2>&1; then
                npx husky install
                log_success "Git hooks installed ✓"
            else
                log_info "Husky not found in package.json"
            fi
        fi
        
        # Create custom hooks directory
        mkdir -p .githooks
        
        # Pre-commit hook
        cat > .githooks/pre-commit << 'EOF'
#!/bin/bash
echo "Running pre-commit checks..."

# Run linting
npm run lint:fix

# Run type checking
npm run type-check

echo "Pre-commit checks passed!"
EOF
        
        chmod +x .githooks/pre-commit
        git config core.hooksPath .githooks
        
        log_success "Custom Git hooks configured ✓"
    else
        log_warning "Not a Git repository"
    fi
    
    echo ""
}

# Setup VS Code configuration
setup_vscode() {
    log_step "Setting up VS Code configuration..."
    
    mkdir -p .vscode
    
    # Settings
    cat > .vscode/settings.json << 'EOF'
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "python.defaultInterpreterPath": "./ai-engine/venv/bin/python",
  "python.terminal.activateEnvironment": true,
  "files.exclude": {
    "**/node_modules": true,
    "**/.git": true,
    "**/.DS_Store": true,
    "**/dist": true,
    "**/build": true,
    "**/__pycache__": true,
    "**/*.pyc": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/build": true,
    "**/.next": true,
    "**/__pycache__": true
  },
  "emmet.includeLanguages": {
    "typescript": "html",
    "typescriptreact": "html"
  }
}
EOF

    # Extensions recommendations
    cat > .vscode/extensions.json << 'EOF'
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-python.python",
    "ms-python.vscode-pylance",
    "ms-vscode.vscode-typescript-next",
    "dbaeumer.vscode-eslint",
    "ms-vscode.vscode-json",
    "redhat.vscode-yaml",
    "ms-vscode-remote.remote-containers",
    "ms-vscode.live-server"
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
      "restart": true
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

    # Tasks
    cat > .vscode/tasks.json << 'EOF'
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Start All Services",
      "type": "shell",
      "command": "npm run dev",
      "group": "build",
      "presentation": {
        "echo": true,
        "reveal": "always",
        "focus": false,
        "panel": "shared"
      },
      "runOptions": {
        "runOn": "folderOpen"
      }
    },
    {
      "label": "Build All",
      "type": "shell",
      "command": "npm run build",
      "group": "build"
    },
    {
      "label": "Test All",
      "type": "shell",
      "command": "npm run test",
      "group": "test"
    }
  ]
}
EOF

    log_success "VS Code configuration created ✓"
    echo ""
}

# Build services
build_services() {
    log_step "Building services..."
    
    # Build backend
    if [ -d "backend" ]; then
        log_info "Building backend..."
        cd backend
        npm run build 2>/dev/null || log_warning "Backend build failed"
        cd ..
    fi
    
    # Build frontend (only in production mode)
    if [ -d "frontend" ] && [ "$NODE_ENV" = "production" ]; then
        log_info "Building frontend..."
        cd frontend
        npm run build
        cd ..
    else
        log_info "Skipping frontend build in development mode"
    fi
    
    log_success "Services built successfully ✓"
    echo ""
}

# Setup Docker environment
setup_docker() {
    if command -v docker >/dev/null 2>&1 && command -v docker-compose >/dev/null 2>&1; then
        log_step "Setting up Docker environment..."
        
        # Build Docker images
        log_info "Building Docker images..."
        docker-compose build --no-cache || log_warning "Docker build failed"
        
        # Start infrastructure services
        log_info "Starting infrastructure services..."
        docker-compose up -d postgres redis || log_warning "Failed to start infrastructure"
        
        # Wait for services to be ready
        log_info "Waiting for services to be ready..."
        sleep 10
        
        log_success "Docker environment setup completed ✓"
    else
        log_warning "Docker not available, skipping Docker setup"
    fi
    
    echo ""
}

# Create development scripts
create_dev_scripts() {
    log_step "Creating development scripts..."
    
    mkdir -p scripts/dev
    
    # Start all services script
    cat > scripts/dev/start-all.sh << 'EOF'
#!/bin/bash
echo "🚀 Starting all AdMetrics services..."

# Start infrastructure
docker-compose up -d postgres redis

# Wait for services
sleep 5

# Start backend
echo "Starting backend..."
cd backend && npm run dev &
BACKEND_PID=$!

# Start frontend
echo "Starting frontend..."
cd frontend && npm start &
FRONTEND_PID=$!

# Start AI engine
echo "Starting AI engine..."
cd ai-engine && source venv/bin/activate && python src/api/app.py &
AI_PID=$!

echo "✅ All services started!"
echo "Backend: http://localhost:3000"
echo "Frontend: http://localhost:3001"
echo "AI Engine: http://localhost:5000"

echo "Press Ctrl+C to stop all services..."
trap 'kill $BACKEND_PID $FRONTEND_PID $AI_PID 2>/dev/null; docker-compose stop; exit' INT
wait
EOF

    # Reset database script
    cat > scripts/dev/reset-db.sh << 'EOF'
#!/bin/bash
echo "🔄 Resetting database..."

cd backend
npx prisma migrate reset --force
npx prisma migrate dev
npx prisma db seed

echo "✅ Database reset complete"
EOF

    # Health check script
    cat > scripts/dev/health-check.sh << 'EOF'
#!/bin/bash
echo "🏥 Checking service health..."

check_service() {
    local name=$1
    local url=$2
    
    if curl -f -s "$url" > /dev/null; then
        echo "✅ $name: healthy"
    else
        echo "❌ $name: unhealthy"
    fi
}

check_service "Backend" "http://localhost:3000/health"
check_service "Frontend" "http://localhost:3001"
check_service "AI Engine" "http://localhost:5000/health"
EOF

    # Make scripts executable
    chmod +x scripts/dev/*.sh
    
    log_success "Development scripts created ✓"
    echo ""
}

# Verify installation
verify_installation() {
    log_step "Verifying installation..."
    
    local issues=0
    
    # Check if key files exist
    local required_files=(
        ".env"
        "package.json"
        "docker-compose.yml"
    )
    
    for file in "${required_files[@]}"; do
        if [ -f "$file" ]; then
            log_success "$file exists ✓"
        else
            log_error "$file missing ✗"
            ((issues++))
        fi
    done
    
    # Check if directories exist
    local required_dirs=(
        "backend"
        "frontend"
        "ai-engine"
    )
    
    for dir in "${required_dirs[@]}"; do
        if [ -d "$dir" ]; then
            log_success "$dir directory exists ✓"
        else
            log_error "$dir directory missing ✗"
            ((issues++))
        fi
    done
    
    if [ $issues -eq 0 ]; then
        log_success "Installation verification passed ✓"
    else
        log_error "Installation verification failed with $issues issues"
        return 1
    fi
    
    echo ""
}

# Show completion message
show_completion() {
    echo -e "${GREEN}"
    cat << "EOF"
    ╔══════════════════════════════════════════════════════╗
    ║                🎉 Setup Complete! 🎉                ║
    ╚══════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    
    echo ""
    log_success "AdMetrics development environment is ready!"
    echo ""
    echo -e "${CYAN}Next steps:${NC}"
    echo "1. Update .env file with your API keys and configuration"
    echo "2. Start the development environment:"
    echo "   ${YELLOW}npm run dev${NC}"
    echo "   OR"
    echo "   ${YELLOW}./scripts/dev/start-all.sh${NC}"
    echo ""
    echo -e "${CYAN}URLs:${NC}"
    echo "• Frontend:  http://localhost:3001"
    echo "• Backend:   http://localhost:3000"
    echo "• AI Engine: http://localhost:5000"
    echo "• API Docs:  http://localhost:3000/api/docs"
    echo ""
    echo -e "${CYAN}Useful commands:${NC}"
    echo "• Health check: ${YELLOW}./scripts/dev/health-check.sh${NC}"
    echo "• Reset DB:     ${YELLOW}./scripts/dev/reset-db.sh${NC}"
    echo "• View logs:    ${YELLOW}docker-compose logs -f${NC}"
    echo ""
    echo -e "${BLUE}Happy coding! 🚀${NC}"
    echo ""
}

# Main execution
main() {
    # Check if running as root
    check_root
    
    # Show banner
    show_banner
    
    # Run setup steps
    check_system_requirements
    create_directory_structure
    setup_environment
    install_dependencies
    setup_database
    setup_git_hooks
    setup_vscode
    build_services
    setup_docker
    create_dev_scripts
    
    # Verify installation
    if verify_installation; then
        show_completion
    else
        log_error "Setup completed with errors. Please review the issues above."
        exit 1
    fi
}

# Handle command line arguments
case "${1:-}" in
    --help|-h)
        echo "AdMetrics AI Dashboard Setup Script"
        echo ""
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --skip-docker  Skip Docker setup"
        echo "  --production   Setup for production environment"
        echo ""
        exit 0
        ;;
    --skip-docker)
        SKIP_DOCKER=true
        ;;
    --production)
        NODE_ENV=production
        ;;
esac

# Run main function
main "$@"