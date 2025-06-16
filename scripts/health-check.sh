#!/bin/bash
# Health check script for AdMetrics services

set -e

# Configuration
ENVIRONMENT=${1:-production}
MAX_RETRIES=30
RETRY_DELAY=2

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Service URLs based on environment
if [ "$ENVIRONMENT" = "production" ]; then
    BACKEND_URL="https://api.admetrics.ai/health"
    FRONTEND_URL="https://dashboard.admetrics.ai"
    AI_URL="https://api.admetrics.ai/ai/health"
else
    BACKEND_URL="http://localhost:3000/health"
    FRONTEND_URL="http://localhost:3001"
    AI_URL="http://localhost:5000/health"
fi

echo -e "${YELLOW}Running health checks for ${ENVIRONMENT} environment...${NC}"

# Function to check service health
check_service() {
    local name=$1
    local url=$2
    local retries=0
    
    echo -n "Checking ${name}... "
    
    while [ $retries -lt $MAX_RETRIES ]; do
        if curl -sf "${url}" > /dev/null 2>&1; then
            echo -e "${GREEN}OK${NC}"
            return 0
        fi
        
        retries=$((retries + 1))
        sleep $RETRY_DELAY
    done
    
    echo -e "${RED}FAILED${NC}"
    return 1
}

# Check all services
FAILED=0

check_service "Backend API" "$BACKEND_URL" || FAILED=1
check_service "Frontend" "$FRONTEND_URL" || FAILED=1
check_service "AI Engine" "$AI_URL" || FAILED=1

# Check database connectivity
echo -n "Checking Database... "
if docker-compose exec -T postgres pg_isready -U admetrics > /dev/null 2>&1; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAILED${NC}"
    FAILED=1
fi

# Check Redis
echo -n "Checking Redis... "
if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAILED${NC}"
    FAILED=1
fi

# Summary
echo ""
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All services are healthy!${NC}"
    exit 0
else
    echo -e "${RED}Some services failed health checks${NC}"
    exit 1
fi