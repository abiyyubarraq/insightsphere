#!/bin/bash

# InsightSphere Reset Script
# This script completely resets all data including Qdrant vectors
# Use this when you want to start fresh

set -e

echo "⚠️  RESET MODE: This will DELETE ALL DATA including processed documents!"
echo "🗑️  This includes:"
echo "   • All Qdrant vector collections"
echo "   • All processed document embeddings"
echo "   • All container data"
echo ""
read -p "Are you sure you want to continue? (type 'yes' to confirm): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Reset cancelled"
    exit 0
fi

echo "🚀 Starting InsightSphere with FULL RESET..."

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

echo "🛑 Stopping all containers..."
docker compose down

echo "🗑️  REMOVING ALL DATA (including volumes)..."
# This removes EVERYTHING including Qdrant data
docker compose down --volumes --remove-orphans

echo "🧹 Cleaning up all Docker resources..."
docker system prune -af --volumes

echo "🔨 Building fresh containers..."
docker compose build --no-cache

echo "🚀 Starting containers with fresh data..."
docker compose up -d

# Enable watch mode for development
echo "🔄 Enabling file watch mode..."
docker compose watch &
WATCH_PID=$!

echo "⏳ Waiting for services to be ready..."
sleep 10

# Check service health
echo "🔍 Checking service health..."

echo -n "  Qdrant: "
if curl -s http://localhost:6333/health > /dev/null; then
    echo "✅ Running (fresh database)"
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
echo "🎉 InsightSphere is ready with FRESH DATA!"
echo ""
echo "⚠️  IMPORTANT: All previous data has been deleted!"
echo "   • You'll need to re-process your documents"
echo "   • All vector embeddings have been cleared"
echo "   • Qdrant collections are empty"
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
echo "📋 Next steps:"
echo "  1. Process some documents: http://localhost:8000/v1/test/process"
echo "  2. Test RAG queries: http://localhost:8000/v1/test/rag-query"
echo ""
echo "📋 Useful commands:"
echo "  View logs:        docker compose logs -f"
echo "  Stop services:    docker compose down"
echo "  Restart:          docker compose restart"
echo "  Stop file watch:  kill $WATCH_PID"
echo ""
