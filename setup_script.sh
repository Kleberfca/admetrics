#!/bin/bash

# ==============================================
# AdMetrics AI Dashboard Setup Script
# ==============================================
# This script sets up the complete development environment
# for the AdMetrics AI Dashboard project.

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ASCII Art Banner
show_banner() {
    echo -e "${BLUE}"
    cat << "EOF"
    ▄▄▄       ▓█████▄  ███▄ ▄███▓▓█████▄▄▄█████▓ ██▀███   ██▓ ▄████▄   ██████ 
   ▒████▄     ▒██▀ ██▌▓██▒▀█▀ ██▒▓█   ▀▓  ██▒ ▓▒▓██ ▒ ██▒▓██▒▒██▀ ▀█ ▒██    ▒ 
   ▒██  ▀█▄   ░██   █▌▓██    ▓██░▒███  ▒ ▓██░ ▒░▓██ ░▄█ ▒▒██▒▒▓█    ▄░ ▓██▄   
   ░██▄▄▄▄██  ░▓█▄   ▌▒██    ▒██ ▒▓█  ▄░ ▓██▓ ░ ▒██▀▀█▄  ░██░▒▓▓▄ ▄██▒ ▒   ██▒
    ▓█   ▓██▒ ░▒████▓ ▒██▒   ░██▒░▒████▒ ▒██▒ ░ ░██▓ ▒██▒░██░▒ ▓███▀ ░▒██████▒▒
    ▒▒   ▓▒█░  ▒▒▓  ▒ ░ ▒░   ░  ░░░ ▒░ ░ ▒ ░░   ░ ▒▓ ░▒▓░░▓  ░ ░▒ ▒  ░▒ ▒▓▒ ▒ ░
     ▒   ▒▒ ░  ░ ▒  ▒ ░  ░      ░ ░ ░  ░   ░      ░▒ ░ ▒░ ▒ ░  ░  ▒   ░ ░▒  ░ ░
     ░   ▒     ░ ░  ░ ░      ░      ░    ░        ░░   ░  ▒ ░░        ░  ░  ░  
         ░  ░    ░           ░      ░  ░           ░      ░  ░ ░            ░  
             ░                                              ░                  
EOF
    echo -e "${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}   AdMetrics AI Dashboard Setup        ${NC}"
    echo -e "${CYAN}   Intelligent Advertising Analytics   ${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
}

# Log functions
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

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check system requirements
check_requirements() {
    log_step "Checking system requirements..."
    
    local missing_deps=()
    
    # Check Node.js
    if command_exists node; then
        NODE_VERSION=$(node --version | cut -d'v' -f2)
        if [[ $(echo "$NODE_VERSION 18.0.0" | tr " " "\n" | sort -V | head -n1) != "18.0.0" ]]; then
            log_warning "Node.js version $NODE_VERSION found. Recommended: >= 18.0.0"
        else
            log_success "Node.js $NODE_VERSION ✓"
        fi
    else
        missing_deps+=("Node.js >= 18.0.0")
    fi
    
    # Check npm
    if command_exists npm; then
        NPM_VERSION=$(npm --version)
        log_success "npm $NPM_VERSION ✓"
    else
        missing_deps+=("npm")
    fi
    
    # Check Python
    if command_exists python3; then
        PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
        if [[ $(echo "$PYTHON_VERSION 3.9.0" | tr " " "\n" | sort -V | head -n1) != "3.9.0" ]]; then
            log_warning "Python version $PYTHON_VERSION found. Recommended: >= 3.9.0"
        else
            log_success "Python $PYTHON_VERSION ✓"
        fi
    else
        missing_deps+=("Python >= 3.9.0")
    fi
    
    # Check Docker
    if command_exists docker; then
        DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | cut -d',' -f1)
        log_success "Docker $DOCKER_VERSION ✓"
    else
        missing_deps+=("Docker")
    fi
    
    # Check Docker Compose
    if command_exists docker-compose || docker compose version >/dev/null 2>&1; then
        log_success "Docker Compose ✓"
    else
        missing_deps+=("Docker Compose")
    fi
    
    # Check Git
    if command_exists git; then
        GIT_VERSION=$(git --version | cut -d' ' -f3)
        log_success "Git $GIT_VERSION ✓"
    else
        missing_deps+=("Git")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        log_error "Missing dependencies:"
        for dep in "${missing_deps[@]}"; do
            echo -e "  ${RED}✗${NC} $dep"
        done
        echo ""
        log_info "Please install the missing dependencies and run this script again."
        echo ""
        echo "Installation guides:"
        echo "  • Node.js: https://nodejs.org/"
        echo "  • Python: https://python.org/"
        echo "  • Docker: https://docs.docker.com/get-docker/"
        echo "  • Git: https://git-scm.com/"
        exit 1
    fi
    
    log_success "All requirements satisfied!"
}

# Create project directory structure
create_directory_structure() {
    log_step "Creating project directory structure..."
    
    # Create main directories
    mkdir -p {backend,frontend,ai-engine,data-pipeline,infrastructure,docs,shared}
    mkdir -p {backend/src,backend/tests,backend/prisma}
    mkdir -p {frontend/src,frontend/public,frontend/tests}
    mkdir -p {ai-engine/src,ai-engine/models,ai-engine/notebooks,ai-engine/tests}
    mkdir -p {data-pipeline/src,data-pipeline/config}
    mkdir -p {infrastructure/{docker,kubernetes,terraform,nginx,monitoring}}
    mkdir -p {shared/{types,constants,utils}}
    mkdir -p {scripts,logs,uploads,backups}
    
    log_success "Directory structure created!"
}

# Setup environment files
setup_environment() {
    log_step "Setting up environment configuration..."
    
    # Copy environment templates
    if [ ! -f .env ]; then
        cp .env.example .env
        log_info "Created .env file from template"
        log_warning "Please edit .env file with your actual configuration values"
    else
        log_info ".env file already exists, skipping..."
    fi
    
    # Generate JWT secret if not set
    if grep -q "your-super-secret-jwt-key" .env; then
        JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)
        sed -i.bak "s/your-super-secret-jwt-key/${JWT_SECRET}/" .env
        log_success "Generated JWT secret"
    fi
    
    # Generate encryption key if not set
    if grep -q "your-32-character-encryption-key" .env; then
        ENCRYPTION_KEY=$(openssl rand -hex 16 2>/dev/null || head -c 16 /dev/urandom | xxd -p)
        sed -i.bak "s/your-32-character-encryption-key/${ENCRYPTION_KEY}/" .env
        log_success "Generated encryption key"
    fi
    
    log_success "Environment configuration ready!"
}

# Install backend dependencies
install_backend() {
    log_step "Installing backend dependencies..."
    
    if [ -d "backend" ]; then
        cd backend
        
        if [ -f "package.json" ]; then
            npm install
            log_success "Backend dependencies installed!"
        else
            log_warning "package.json not found in backend directory"
        fi
        
        cd ..
    else
        log_warning "Backend directory not found"
    fi
}

# Install frontend dependencies
install_frontend() {
    log_step "Installing frontend dependencies..."
    
    if [ -d "frontend" ]; then
        cd frontend
        
        if [ -f "package.json" ]; then
            npm install
            log_success "Frontend dependencies installed!"
        else
            log_warning "package.json not found in frontend directory"
        fi
        
        cd ..
    else
        log_warning "Frontend directory not found"
    fi
}

# Install AI engine dependencies
install_ai_engine() {
    log_step "Installing AI engine dependencies..."
    
    if [ -d "ai-engine" ]; then
        cd ai-engine
        
        if [ -f "requirements.txt" ]; then
            # Create virtual environment
            python3 -m venv venv
            source venv/bin/activate
            
            # Upgrade pip
            pip install --upgrade pip
            
            # Install dependencies
            pip install -r requirements.txt
            
            log_success "AI engine dependencies installed!"
            log_info "Virtual environment created at ai-engine/venv"
            log_info "Activate with: source ai-engine/venv/bin/activate"
        else
            log_warning "requirements.txt not found in ai-engine directory"
        fi
        
        cd ..
    else
        log_warning "AI engine directory not found"
    fi
}

# Setup database
setup_database() {
    log_step "Setting up database..."
    
    # Start database services
    docker-compose up -d postgres redis
    
    # Wait for database to be ready
    log_info "Waiting for database to be ready..."
    sleep 10
    
    # Run database migrations
    if [ -d "backend" ] && [ -f "backend/package.json" ]; then
        cd backend
        npx prisma migrate dev --name init
        log_success "Database migrations completed!"
        cd ..
    fi
    
    log_success "Database setup completed!"
}

# Build Docker images
build_docker_images() {
    log_step "Building Docker images..."
    
    docker-compose build --parallel
    
    log_success "Docker images built successfully!"
}

# Start services
start_services() {
    log_step "Starting all services..."
    
    docker-compose up -d
    
    # Wait for services to be ready
    log_info "Waiting for services to start..."
    sleep 30
    
    # Health checks
    log_info "Performing health checks..."
    
    # Check backend
    if curl -f http://localhost:3000/health >/dev/null 2>&1; then
        log_success "Backend API ✓"
    else
        log_warning "Backend API not responding"
    fi
    
    # Check frontend
    if curl -f http://localhost:3001 >/dev/null 2>&1; then
        log_success "Frontend ✓"
    else
        log_warning "Frontend not responding"
    fi
    
    # Check AI engine
    if curl -f http://localhost:5000/health >/dev/null 2>&1; then
        log_success "AI Engine ✓"
    else
        log_warning "AI Engine not responding"
    fi
    
    log_success "Services started successfully!"
}

# Show final instructions
show_completion() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}   🎉 Setup Complete! 🎉              ${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${CYAN}Services are now running:${NC}"
    echo -e "  • Frontend:  ${BLUE}http://localhost:3001${NC}"
    echo -e "  • Backend:   ${BLUE}http://localhost:3000${NC}"
    echo -e "  • AI Engine: ${BLUE}http://localhost:5000${NC}"
    echo -e "  • API Docs:  ${BLUE}http://localhost:3000/api/docs${NC}"
    echo ""
    echo -e "${CYAN}Useful commands:${NC}"
    echo -e "  • View logs:        ${YELLOW}docker-compose logs -f${NC}"
    echo -e "  • Stop services:    ${YELLOW}docker-compose down${NC}"
    echo -e "  • Restart services: ${YELLOW}docker-compose restart${NC}"
    echo -e "  • View status:      ${YELLOW}docker-compose ps${NC}"
    echo ""
    echo -e "${CYAN}Development:${NC}"
    echo -e "  • Backend dev:      ${YELLOW}cd backend && npm run dev${NC}"
    echo -e "  • Frontend dev:     ${YELLOW}cd frontend && npm start${NC}"
    echo -e "  • AI Engine dev:    ${YELLOW}cd ai-engine && source venv/bin/activate && python src/api/app.py${NC}"
    echo ""
    echo -e "${CYAN}Next steps:${NC}"
    echo -e "  1. Edit ${YELLOW}.env${NC} file with your API credentials"
    echo -e "  2. Set up platform integrations (Google Ads, Facebook Ads, etc.)"
    echo -e "  3. Configure AI models for your specific use case"
    echo -e "  4. Customize dashboard widgets and layouts"
    echo ""
    echo -e "${GREEN}Happy coding! 🚀${NC}"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up..."
    docker-compose down
}

# Error handler
error_handler() {
    log_error "Setup failed at step: $1"
    log_info "Check the logs above for details"
    log_info "You can re-run this script to continue from where it left off"
    cleanup
    exit 1
}

# Main setup function
main() {
    show_banner
    
    # Parse command line arguments
    SKIP_DEPS=false
    SKIP_DOCKER=false
    DEV_MODE=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-deps)
                SKIP_DEPS=true
                shift
                ;;
            --skip-docker)
                SKIP_DOCKER=true
                shift
                ;;
            --dev)
                DEV_MODE=true
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --skip-deps    Skip dependency installation"
                echo "  --skip-docker  Skip Docker setup"
                echo "  --dev          Setup for development mode"
                echo "  --help         Show this help message"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Trap errors
    trap 'error_handler "main setup"' ERR
    
    # Run setup steps
    check_requirements
    create_directory_structure
    setup_environment
    
    if [ "$SKIP_DEPS" = false ]; then
        install_backend
        install_frontend
        install_ai_engine
    fi
    
    if [ "$SKIP_DOCKER" = false ]; then
        setup_database
        build_docker_images
        start_services
    fi
    
    show_completion
}

# Run main function with all arguments
main "$@"