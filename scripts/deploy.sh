#!/bin/bash
# Deployment script for AdMetrics

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-production}
DOCKER_REGISTRY=${DOCKER_REGISTRY:-"registry.admetrics.ai"}
VERSION=${VERSION:-$(git rev-parse --short HEAD)}
NAMESPACE="admetrics-${ENVIRONMENT}"

echo -e "${GREEN}Deploying AdMetrics to ${ENVIRONMENT} environment${NC}"
echo "Version: ${VERSION}"

# Function to check command availability
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}Error: $1 is not installed${NC}"
        exit 1
    fi
}

# Check required commands
check_command docker
check_command docker-compose
check_command git

# Build and push Docker images
echo -e "${YELLOW}Building Docker images...${NC}"

# Backend
docker build -t ${DOCKER_REGISTRY}/admetrics-backend:${VERSION} -t ${DOCKER_REGISTRY}/admetrics-backend:latest ./backend
docker push ${DOCKER_REGISTRY}/admetrics-backend:${VERSION}
docker push ${DOCKER_REGISTRY}/admetrics-backend:latest

# Frontend
docker build -t ${DOCKER_REGISTRY}/admetrics-frontend:${VERSION} -t ${DOCKER_REGISTRY}/admetrics-frontend:latest ./frontend
docker push ${DOCKER_REGISTRY}/admetrics-frontend:${VERSION}
docker push ${DOCKER_REGISTRY}/admetrics-frontend:latest

# AI Engine
docker build -t ${DOCKER_REGISTRY}/admetrics-ai:${VERSION} -t ${DOCKER_REGISTRY}/admetrics-ai:latest ./ai-engine
docker push ${DOCKER_REGISTRY}/admetrics-ai:${VERSION}
docker push ${DOCKER_REGISTRY}/admetrics-ai:latest

echo -e "${GREEN}Docker images built and pushed successfully${NC}"

# Deploy based on environment
if [ "$ENVIRONMENT" = "production" ]; then
    echo -e "${YELLOW}Deploying to production...${NC}"
    
    # Run database migrations
    echo "Running database migrations..."
    docker run --rm \
        --env-file .env.production \
        ${DOCKER_REGISTRY}/admetrics-backend:${VERSION} \
        npm run prisma:migrate:prod
    
    # Deploy with Docker Compose
    docker-compose -f docker-compose.prod.yml up -d
    
    # Wait for services to be healthy
    echo "Waiting for services to be healthy..."
    sleep 30
    
    # Run health checks
    ./scripts/health-check.sh production
    
elif [ "$ENVIRONMENT" = "staging" ]; then
    echo -e "${YELLOW}Deploying to staging...${NC}"
    
    # Similar to production but with staging configuration
    docker-compose -f docker-compose.staging.yml up -d
    
else
    echo -e "${RED}Unknown environment: ${ENVIRONMENT}${NC}"
    exit 1
fi

echo -e "${GREEN}Deployment completed successfully!${NC}"
echo "Version ${VERSION} is now live in ${ENVIRONMENT}"

# Send deployment notification (optional)
if [ ! -z "$SLACK_WEBHOOK_URL" ]; then
    curl -X POST -H 'Content-type: application/json' \
        --data "{\"text\":\"AdMetrics ${VERSION} deployed to ${ENVIRONMENT}\"}" \
        $SLACK_WEBHOOK_URL
fi