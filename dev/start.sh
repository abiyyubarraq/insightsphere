#!/bin/bash

# InsightSphere Backend Startup Script
# This script starts all backend services for local development

set -e

echo "🚀 Starting InsightSphere Backend Services..."

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found!"
    echo "📋 Please copy .env.example to .env and fill in your configuration:"
    echo "   cp .env.example .env"
    echo "   nano .env  # Edit with your actual values"
    exit 1
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Start services with file watching for auto-rebuild
echo "🐳 Starting Docker services with file watching..."
echo "💡 Using Docker Compose watch mode for auto-rebuild on file changes"

# Stop any existing containers first
echo "🛑 Stopping existing containers..."
docker compose down

echo "🧹 Cleaning up old containers and images..."
# Remove old containers and build cache
docker compose down --volumes --remove-orphans
docker system prune -f

echo "🔨 Building fresh containers to ensure latest code..."
# Force rebuild containers to get latest code
docker compose build --no-cache

echo "🚀 Starting containers..."
docker compose up -d

# Enable watch mode for development (requires Docker Compose v2.22+)
echo "🔄 Enabling file watch mode..."
docker compose watch &
WATCH_PID=$!

echo "⏳ Waiting for services to be ready..."
sleep 10

# Check service health
echo "🔍 Checking service health..."

echo -n "  Qdrant: "
if curl -s http://localhost:6333/health > /dev/null; then
    echo "✅ Running"
else
    echo "❌ Not responding"
fi

echo -n "  Parser: "
if curl -s http://localhost:8080/health > /dev/null; then
    echo "✅ Running"
else
    echo "❌ Not responding"
fi

echo -n "  API: "
if curl -s http://localhost:8000/health > /dev/null; then
    echo "✅ Running"
else
    echo "❌ Not responding"
fi

echo -n "  Frontend: "
if curl -s http://localhost:5173 > /dev/null; then
    echo "✅ Running"
else
    echo "❌ Not responding"
fi

echo ""
echo "🎉 InsightSphere Backend is ready!"
echo ""
echo "📊 Service URLs:"
echo "  Frontend:  http://localhost:5173"
echo "  API:       http://localhost:8000"
echo "  Parser:    http://localhost:8080"
echo "  Qdrant:    http://localhost:6333"
echo ""
echo "🧪 Test Dashboard:"
echo "  Browser Tests: http://localhost:8000/v1/test/dashboard"
echo ""
echo "📋 Useful commands:"
echo "  View logs:        docker compose logs -f"
echo "  Stop services:    docker compose down"
echo "  Restart:          docker compose restart"
echo "  Stop file watch:  kill $WATCH_PID"
echo ""
echo "🔄 Auto-rebuild enabled:"
echo "  • Go files (doc-parser): Auto-rebuild on change"
echo "  • TypeScript files (API): Auto-reload with Deno watch"
echo "  • Frontend files: Auto-reload with Vite HMR"
echo ""