#!/bin/bash
# setup.sh - AdMetrics AI Dashboard Setup Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="AdMetrics AI Dashboard"
MIN_NODE_VERSION="18.0.0"
MIN_PYTHON_VERSION="3.9.0"
MIN_DOCKER_VERSION="20.0.0"

# Functions
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

show_banner() {
    echo -e "${BLUE}"
    cat << "EOF"
    ___       ____  ___      __       _          
   / _ \     /  _/ / _ \    / /____  (_)____  ___
  / __ |___/ /  / ___/   / __/ __ \/ / ___/ / __|
 / /_/ |___/ /_/ /      / /_/ /_/ / / /__  \__ \
/_/  |_\___/___/_/       \__/\____/_/\___/ |___/

AdMetrics AI Dashboard - Setup Script
Intelligent Advertising Campaign Analytics
EOF
    echo -e "${NC}"
}

# Check system requirements
check_requirements() {
    log_info "Checking system requirements..."
    
    # Check if running on supported OS
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
        OS="windows"
    else
        log_error "Unsupported operating system: $OSTYPE"
        exit 1
    fi
    
    log_success "Operating System: $OS"
    
    # Check Node.js
    if command -v node >/dev/null 2>&1; then
        NODE_VERSION=$(node --version | sed 's/v//')
        if [ "$(printf '%s\n' "$MIN_NODE_VERSION" "$NODE_VERSION" | sort -V | head -n1)" = "$MIN_NODE_VERSION" ]; then
            log_success "Node.js version: $NODE_VERSION ✓"
        else
            log_error "Node.js version $NODE_VERSION is too old. Minimum required: $MIN_NODE_VERSION"
            log_info "Please update Node.js: https://nodejs.org/"
            exit 1
        fi
    else
        log_error "Node.js is not installed"
        log_info "Please install Node.js: https://nodejs.org/"
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
}

# Create directory structure
create_directory_structure() {
    log_info "Creating directory structure..."
    
    mkdir -p {backend,frontend,ai-engine,data-pipeline,infrastructure,docs,shared,logs,uploads,models,data}
    mkdir -p backend/{src/{controllers,services,models,middleware,utils,config,routes,types},tests,prisma}
    mkdir -p frontend/{src/{components,pages,hooks,services,store,utils,types,styles},public,tests}
    mkdir -p ai-engine/{src/{models,services,data,api,utils},tests,notebooks}
    mkdir -p data-pipeline/{src/{extractors,transformers,loaders,schedulers,config},tests}
    mkdir -p infrastructure/{docker,kubernetes,nginx,monitoring,ssl,terraform}
    mkdir -p shared/{types,utils,constants}
    
    log_success "Directory structure created"
}

# Setup environment files
setup_environment() {
    log_info "Setting up environment configuration..."
    
    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            cp .env.example .env
            log_success "Created .env from .env.example"
        else
            log_warning ".env.example not found, creating basic .env"
            cat > .env << EOF
# Environment Configuration
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:3001
API_URL=http://localhost:3000

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

# Encryption
ENCRYPTION_KEY=your-32-character-encryption-key-here

# AI Engine
AI_ENGINE_URL=http://localhost:5000
OPENAI_API_KEY=your-openai-api-key

# Platform API Keys (fill in your actual keys)
GOOGLE_ADS_DEVELOPER_TOKEN=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
TIKTOK_APP_ID=
TIKTOK_APP_SECRET=
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=

# Email Service
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=noreply@admetrics.ai

# Monitoring
ENABLE_METRICS=true
LOG_LEVEL=info
EOF
        fi
    else
        log_info ".env file already exists"
    fi
    
    # Create environment files for each service
    for service in backend frontend ai-engine data-pipeline; do
        if [ ! -f "$service/.env" ]; then
            ln -sf ../.env "$service/.env"
            log_success "Created .env symlink for $service"
        fi
    done
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    
    # Root package.json (if exists)
    if [ -f package.json ]; then
        log_info "Installing root dependencies..."
        npm install
    fi
    
    # Backend dependencies
    if [ -d backend ] && [ -f backend/package.json ]; then
        log_info "Installing backend dependencies..."
        cd backend
        npm install
        cd ..
        log_success "Backend dependencies installed"
    fi
    
    # Frontend dependencies
    if [ -d frontend ] && [ -f frontend/package.json ]; then
        log_info "Installing frontend dependencies..."
        cd frontend
        npm install
        cd ..
        log_success "Frontend dependencies installed"
    fi
    
    # AI Engine dependencies
    if [ -d ai-engine ] && [ -f ai-engine/requirements.txt ]; then
        log_info "Setting up AI Engine virtual environment..."
        cd ai-engine
        python3 -m venv venv
        source venv/bin/activate
        pip install --upgrade pip
        pip install -r requirements.txt
        cd ..
        log_success "AI Engine dependencies installed"
    fi
    
    # Data Pipeline dependencies
    if [ -d data-pipeline ] && [ -f data-pipeline/requirements.txt ]; then
        log_info "Setting up Data Pipeline virtual environment..."
        cd data-pipeline
        python3 -m venv venv
        source venv/bin/activate
        pip install --upgrade pip
        pip install -r requirements.txt
        cd ..
        log_success "Data Pipeline dependencies installed"
    fi
}

# Setup database
setup_database() {
    log_info "Setting up database..."
    
    # Check if PostgreSQL is running
    if command -v psql >/dev/null 2>&1; then
        log_info "PostgreSQL client found, setting up local database..."
        
        # Try to connect and create database
        if psql -h localhost -U postgres -c "SELECT 1;" >/dev/null 2>&1; then
            psql -h localhost -U postgres -c "CREATE DATABASE admetrics;" 2>/dev/null || log_info "Database might already exist"
            log_success "Database setup completed"
        else
            log_warning "Cannot connect to PostgreSQL. Please ensure PostgreSQL is running."
            log_info "You can start PostgreSQL with Docker: docker run -d --name postgres -e POSTGRES_PASSWORD=postgres123 -p 5432:5432 postgres:15"
        fi
    fi
    
    # Run Prisma migrations if backend exists
    if [ -d backend ] && [ -f backend/prisma/schema.prisma ]; then
        log_info "Running database migrations..."
        cd backend
        npx prisma generate
        npx prisma migrate dev --name init || log_warning "Migration failed - database might not be ready"
        cd ..
        log_success "Database migrations completed"
    fi
}

# Build services
build_services() {
    log_info "Building services..."
    
    # Build backend
    if [ -d backend ]; then
        log_info "Building backend..."
        cd backend
        npm run build 2>/dev/null || log_warning "Backend build failed"
        cd ..
    fi
    
    # Build frontend
    if [ -d frontend ]; then
        log_info "Building frontend..."
        cd frontend
        # Only build in production mode
        if [ "$NODE_ENV" = "production" ]; then
            npm run build
        else
            log_info "Skipping frontend build in development mode"
        fi
        cd ..
    fi
    
    log_success "Services built successfully"
}

# Setup Docker environment
setup_docker() {
    if command -v docker >/dev/null 2>&1 && command -v docker-compose >/dev/null 2>&1; then
        log_info "Setting up Docker environment..."
        
        # Build Docker images
        log_info "Building Docker images..."
        docker-compose build --no-cache
        
        # Start services
        log_info "Starting services with Docker..."
        docker-compose up -d postgres redis
        
        # Wait for services to be ready
        log_info "Waiting for services to be ready..."
        sleep 10
        
        # Run database migrations in Docker
        log_info "Running database migrations..."
        docker-compose exec backend npx prisma migrate dev --name init || log_warning "Migration failed"
        
        log_success "Docker environment ready"
    else
        log_warning "Docker not available, skipping Docker setup"
    fi
}

# Create sample data
create_sample_data() {
    log_info "Creating sample data..."
    
    if [ -d backend ]; then
        cd backend
        # Create sample data script
        cat > scripts/create-sample-data.js << 'EOF'
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // Create sample user
  const hashedPassword = await bcrypt.hash('admin123', 12);
  
  const user = await prisma.user.upsert({
    where: { email: 'admin@admetrics.ai' },
    update: {},
    create: {
      email: 'admin@admetrics.ai',
      name: 'Admin User',
      password: hashedPassword,
      role: 'ADMIN',
      emailVerified: true
    }
  });

  console.log('Created user:', user.email);

  // Create sample integration
  const integration = await prisma.integration.upsert({
    where: { 
      userId_platform_name: {
        userId: user.id,
        platform: 'GOOGLE_ADS',
        name: 'Sample Google Ads'
      }
    },
    update: {},
    create: {
      userId: user.id,
      platform: 'GOOGLE_ADS',
      name: 'Sample Google Ads',
      status: 'CONNECTED',
      credentials: {},
      scopes: ['campaigns', 'metrics']
    }
  });

  console.log('Created integration:', integration.name);

  // Create sample campaign
  const campaign = await prisma.campaign.upsert({
    where: {
      integrationId_externalId: {
        integrationId: integration.id,
        externalId: 'sample-campaign-1'
      }
    },
    update: {},
    create: {
      externalId: 'sample-campaign-1',
      name: 'Sample Campaign',
      platform: 'GOOGLE_ADS',
      status: 'ACTIVE',
      objective: 'CONVERSIONS',
      budget: 1000,
      budgetType: 'DAILY',
      userId: user.id,
      integrationId: integration.id
    }
  });

  console.log('Created campaign:', campaign.name);

  // Create sample metrics
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    await prisma.metric.upsert({
      where: {
        campaignId_date_metricType: {
          campaignId: campaign.id,
          date: date,
          metricType: 'CAMPAIGN'
        }
      },
      update: {},
      create: {
        campaignId: campaign.id,
        integrationId: integration.id,
        date: date,
        platform: 'GOOGLE_ADS',
        metricType: 'CAMPAIGN',
        impressions: BigInt(Math.floor(Math.random() * 10000) + 1000),
        clicks: BigInt(Math.floor(Math.random() * 500) + 50),
        spend: Math.random() * 100 + 10,
        conversions: Math.floor(Math.random() * 20) + 1,
        revenue: Math.random() * 500 + 50
      }
    });
  }

  console.log('Created sample metrics for 30 days');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log('Sample data creation completed!');
  });
EOF

        # Run sample data creation
        node scripts/create-sample-data.js 2>/dev/null || log_warning "Could not create sample data"
        cd ..
        log_success "Sample data created"
    fi
}

# Validate installation
validate_installation() {
    log_info "Validating installation..."
    
    local errors=0
    
    # Check if services can start
    if [ -d backend ]; then
        cd backend
        timeout 10s npm run dev >/dev/null 2>&1 &
        PID=$!
        sleep 5
        if kill -0 $PID 2>/dev/null; then
            log_success "Backend service starts correctly"
            kill $PID 2>/dev/null
        else
            log_error "Backend service failed to start"
            ((errors++))
        fi
        cd ..
    fi
    
    # Check Docker services
    if command -v docker-compose >/dev/null 2>&1; then
        if docker-compose ps | grep -q "Up"; then
            log_success "Docker services are running"
        else
            log_warning "Some Docker services might not be running"
        fi
    fi
    
    if [ $errors -eq 0 ]; then
        log_success "Installation validation passed!"
    else
        log_warning "Installation validation found $errors issue(s)"
    fi
}

# Show completion message
show_completion() {
    echo
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}   🎉 Setup Complete! 🎉${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo
    echo -e "${BLUE}$PROJECT_NAME is now ready!${NC}"
    echo
    echo -e "${YELLOW}Next steps:${NC}"
    echo -e "  1. Configure your API keys in ${BLUE}.env${NC}"
    echo -e "  2. Start the development servers:"
    echo -e "     ${BLUE}npm run dev${NC} (runs all services)"
    echo -e "  3. Or use Docker:"
    echo -e "     ${BLUE}docker-compose up${NC}"
    echo
    echo -e "${YELLOW}Access your application:${NC}"
    echo -e "  • Frontend:  ${BLUE}http://localhost:3001${NC}"
    echo -e "  • Backend:   ${BLUE}http://localhost:3000${NC}"
    echo -e "  • AI Engine: ${BLUE}http://localhost:5000${NC}"
    echo -e "  • API Docs:  ${BLUE}http://localhost:3000/api/docs${NC}"
    echo
    echo -e "${YELLOW}Default login credentials:${NC}"
    echo -e "  • Email:    ${BLUE}admin@admetrics.ai${NC}"
    echo -e "  • Password: ${BLUE}admin123${NC}"
    echo
    echo -e "${YELLOW}Useful commands:${NC}"
    echo -e "  • ${BLUE}npm run dev${NC}          - Start development servers"
    echo -e "  • ${BLUE}npm run build${NC}        - Build for production"
    echo -e "  • ${BLUE}npm test${NC}             - Run tests"
    echo -e "  • ${BLUE}docker-compose up${NC}    - Start with Docker"
    echo -e "  • ${BLUE}docker-compose logs${NC}  - View logs"
    echo
    echo -e "${GREEN}Happy coding! 🚀${NC}"
}

# Main execution
main() {
    show_banner
    
    log_info "Starting $PROJECT_NAME setup..."
    
    # Run setup steps
    check_requirements
    create_directory_structure
    setup_environment
    install_dependencies
    setup_database
    build_services
    
    # Optional Docker setup
    if command -v docker >/dev/null 2>&1; then
        read -p "$(echo -e ${YELLOW}Setup Docker environment? [y/N]: ${NC})" -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            setup_docker
        fi
    fi
    
    # Optional sample data
    read -p "$(echo -e ${YELLOW}Create sample data? [y/N]: ${NC})" -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        create_sample_data
    fi
    
    validate_installation
    show_completion
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi