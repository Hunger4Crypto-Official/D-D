#!/bin/bash
# docker-deploy.sh - Docker deployment script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}🐳 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Configuration
COMPOSE_FILE="docker-compose.yml"
SERVICE_NAME="ledger-legends"
HEALTH_TIMEOUT=60

# Parse command line arguments
REBUILD=false
WITH_PROXY=false
BACKUP_BEFORE=false
LOGS_TAIL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --rebuild)
            REBUILD=true
            shift
            ;;
        --with-proxy)
            WITH_PROXY=true
            shift
            ;;
        --backup)
            BACKUP_BEFORE=true
            shift
            ;;
        --logs)
            LOGS_TAIL=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --rebuild        Force rebuild of Docker image"
            echo "  --with-proxy     Start with nginx reverse proxy"
            echo "  --backup         Create backup before deployment"
            echo "  --logs           Show logs after deployment"
            echo "  -h, --help       Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

print_status "Starting Docker deployment for LedgerLegends..."

# Check prerequisites
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed"
    exit 1
fi

# Check if docker daemon is running
if ! docker info &> /dev/null; then
    print_error "Docker daemon is not running"
    exit 1
fi

print_success "Docker and Docker Compose are available"

# Check if .env exists
if [ ! -f ".env" ]; then
    print_error ".env file not found"
    if [ -f ".env.example" ]; then
        print_status "Copying .env.example to .env..."
        cp .env.example .env
        print_warning "Please edit .env file with your configuration before continuing."
        exit 1
    else
        print_error "Please create .env file with your configuration"
        exit 1
    fi
fi

# Create necessary directories
print_status "Creating directories..."
mkdir -p data
mkdir -p content
mkdir -p backups
mkdir -p logs

# Create backup if requested
if [ "$BACKUP_BEFORE" = true ] && [ -f "data/bot.db" ]; then
    print_status "Creating backup before deployment..."
    if [ -f "scripts/backup.sh" ]; then
        ./scripts/backup.sh
    else
        TIMESTAMP=$(date +%Y%m%d_%H%M%S)
        cp "data/bot.db" "backups/backup_pre_deploy_$TIMESTAMP.db"
        print_success "Backup created: backup_pre_deploy_$TIMESTAMP.db"
    fi
fi

# Stop existing containers
print_status "Stopping existing containers..."
docker-compose down || true

# Build arguments
BUILD_ARGS=""
if [ "$REBUILD" = true ]; then
    BUILD_ARGS="--build --no-cache"
    print_status "Forcing rebuild of Docker image..."
else
    BUILD_ARGS="--build"
    print_status "Building Docker image..."
fi

# Determine profiles
PROFILES=""
if [ "$WITH_PROXY" = true ]; then
    PROFILES="--profile with-proxy"
    print_status "Starting with nginx reverse proxy..."
fi

# Build and start services
if docker-compose $PROFILES build $BUILD_ARGS; then
    print_success "Docker image built successfully"
else
    print_error "Docker build failed"
    exit 1
fi

print_status "Starting services..."
if docker-compose $PROFILES up -d; then
    print_success "Services started successfully"
else
    print_error "Failed to start services"
    exit 1
fi

# Wait for service to be ready
print_status "Waiting for service to be ready..."
COUNTER=0
while [ $COUNTER -lt $HEALTH_TIMEOUT ]; do
    if docker-compose exec -T $SERVICE_NAME node -e "process.exit(0)" 2>/dev/null; then
        break
    fi
    
    if [ $((COUNTER % 10)) -eq 0 ]; then
        echo -n "."
    fi
    
    sleep 1
    COUNTER=$((COUNTER + 1))
done

echo # New line after dots

if [ $COUNTER -ge $HEALTH_TIMEOUT ]; then
    print_error "Service failed to start within $HEALTH_TIMEOUT seconds"
    print_status "Showing logs for troubleshooting:"
    docker-compose logs --tail=50 $SERVICE_NAME
    exit 1
fi

# Check health endpoint if dashboard is enabled
if grep -q "DASHBOARD_PORT" .env; then
    DASHBOARD_PORT=$(grep "DASHBOARD_PORT" .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    if [ -n "$DASHBOARD_PORT" ] && [ "$DASHBOARD_PORT" != "0" ]; then
        print_status "Checking health endpoint..."
        sleep 5  # Give a bit more time for the service to fully start
        
        if curl -f -s "http://localhost:$DASHBOARD_PORT/health" > /dev/null; then
            print_success "Health check passed"
        else
            print_warning "Health check failed, but service appears to be running"
        fi
    fi
fi

print_success "Docker deployment completed successfully!"

# Show service status
print_status "Service status:"
docker-compose ps

echo
print_status "Deployment Summary:"
echo "  🐳 Container: $(docker-compose ps -q $SERVICE_NAME)"
echo "  📊 Dashboard: http://localhost:${DASHBOARD_PORT:-3000}"
echo "  📋 View logs: docker-compose logs -f $SERVICE_NAME"
echo "  🛑 Stop services: docker-compose down"
echo "  🔄 Restart: docker-compose restart $SERVICE_NAME"

if [ "$WITH_PROXY" = true ]; then
    echo "  🌐 Nginx proxy: http://localhost:80"
fi

# Show logs if requested
if [ "$LOGS_TAIL" = true ]; then
    echo
    print_status "Showing recent logs (Ctrl+C to exit):"
    docker-compose logs -f --tail=50 $SERVICE_NAME
fi

print_success "Ready to serve! 🎮"
