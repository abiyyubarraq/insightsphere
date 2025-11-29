# 🚀 InsightSphere Backend Startup Guide

This guide covers how to run all backend services for the InsightSphere document processing pipeline.

## 📋 Prerequisites

Make sure you have the following installed:

- **Docker** and **Docker Compose** (v2.0+)
- **Node.js** (v18+) for frontend development
- **Git** for version control

Optional (for manual service startup):
- **Deno** (v2.4+) for API service
- **Go** (v1.24+) for document parser
- **curl** for testing endpoints

## 🔧 Environment Setup

### 1. Create Environment File

```bash
# Copy the example environment file
cp dev/.env.example dev/.env

# Edit the environment file with your actual values
nano dev/.env  # or use your preferred editor
```

### 2. Required Environment Variables

Fill in these **required** variables in `dev/.env`:

```bash
# OpenAI API Key (required for embeddings)
OPENAI_API_KEY=sk-your-actual-openai-api-key

# Supabase Configuration (required for file storage and auth)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-actual-service-role-key
SUPABASE_STORAGE_BUCKET=your-bucket-name

# Frontend Supabase Config (for authentication)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-actual-anon-key
```

## 🐳 Docker Compose Startup (Recommended)

### Start All Services

```bash
# Navigate to dev directory
cd dev

# Start all services in background
docker compose up -d

# Or start with logs visible
docker compose up
```

### Service Overview

This will start:

| Service | Port | Description | Health Check |
|---------|------|-------------|--------------|
| **qdrant** | 6333 | Vector database | http://localhost:6333/health |
| **doc-parser** | 8080 | Go PDF/DOCX parser | http://localhost:8080/health |
| **api** | 8000 | Deno API server | http://localhost:8000/health |
| **frontend** | 5173 | SvelteKit frontend | http://localhost:5173 |
| **redis** | 6379 | Cache & sessions | redis-cli ping |
| **firebase-emulator** | 9099, 4000 | Local auth testing | http://localhost:4000 |

### Check Service Status

```bash
# Check all services
docker compose ps

# Check service logs
docker compose logs api
docker compose logs doc-parser
docker compose logs qdrant

# Follow logs in real-time
docker compose logs -f api
```

### Stop Services

```bash
# Stop all services
docker compose down

# Stop and remove volumes (⚠️ deletes data)
docker compose down -v
```

## 🔄 Service Testing

### 1. Test Qdrant Vector Database

```bash
# Check Qdrant health
curl http://localhost:6333/health

# Expected response:
# {"title":"qdrant - vector search engine","version":"1.x.x"}
```

### 2. Test Document Parser

```bash
# Check parser health
curl http://localhost:8080/health

# Expected response:
# {"status":"healthy","timestamp":"2024-01-15T10:30:00Z","service":"doc-parser"}
```

### 3. Test Main API

```bash
# Check API health
curl http://localhost:8000/health

# Expected response:
# {"status":"healthy","timestamp":"2024-01-15T10:30:00.000Z","version":"1.0.0"}
```

### 4. Test Document Processing Pipeline

```bash
# Test document processing (requires valid JWT token)
curl -X POST http://localhost:8000/v1/documents/process \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "550e8400-e29b-41d4-a716-446655440000",
    "document_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "storage_path": "user123/project456/1699123456789_document.pdf"
  }'
```

## 🛠️ Manual Service Startup (Development)

If you prefer to run services individually:

### 1. Start Qdrant

```bash
# Using Docker
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant:latest

# Or install locally: https://qdrant.tech/documentation/quick-start/
```

### 2. Start Document Parser

```bash
cd doc-parsing

# Install dependencies
go mod download

# Run the service
go run main.go

# Or build and run
go build -o doc-parser
./doc-parser
```

### 3. Start API Server

```bash
cd api

# Install Deno if not already installed
# curl -fsSL https://deno.land/install.sh | sh

# Run development server
deno task dev

# Or run production build
deno task start
```

### 4. Start Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

## 🔍 Monitoring & Debugging

### Service Logs

```bash
# API logs
docker compose logs api

# Parser logs
docker compose logs doc-parser

# Qdrant logs
docker compose logs qdrant

# Follow all logs
docker compose logs -f
```

### Common Issues

#### 1. **Permission Denied Errors**
```bash
# Fix Docker permission issues
sudo chmod 666 /var/run/docker.sock
```

#### 2. **Port Already in Use**
```bash
# Find process using port
lsof -i :8000
lsof -i :8080
lsof -i :6333

# Kill process if needed
kill -9 <PID>
```

#### 3. **Environment Variables Not Loading**
```bash
# Check if .env file exists
ls -la dev/.env

# Restart services after env changes
docker compose down && docker compose up -d
```

#### 4. **Qdrant Collection Issues**
```bash
# Delete and recreate collection
curl -X DELETE http://localhost:6333/collections/insightsphere-docs
```

#### 5. **Memory Issues**
```bash
# Increase Docker memory limit in Docker Desktop
# Or add to docker-compose.yaml:
mem_limit: 2g
```

### Performance Monitoring

```bash
# Check resource usage
docker stats

# Check specific service
docker stats insightsphere-api-1
```

## 🔧 Development Workflow

### 1. **Code Changes in API**
```bash
# API auto-reloads with --watch flag
# Just save your changes and they'll be picked up
```

### 2. **Code Changes in Parser**
```bash
# Rebuild parser service
docker compose build doc-parser
docker compose up -d doc-parser
```

### 3. **Database Schema Changes**
```bash
# Reset Qdrant data
docker compose down -v
docker compose up qdrant
```

### 4. **Testing Changes**
```bash
# Run tests
cd api && deno task test
cd doc-parsing && go test
cd frontend && npm test
```

## 🎯 Ready to Use!

Once all services are running:

1. **Frontend**: http://localhost:5173
2. **API**: http://localhost:8000
3. **Parser**: http://localhost:8080
4. **Qdrant**: http://localhost:6333
5. **Firebase UI**: http://localhost:4000

Your document processing pipeline is now ready! Upload documents through the frontend and they'll automatically be processed, embedded, and stored in Qdrant for AI-powered search.

## 🆘 Need Help?

- Check service logs: `docker compose logs <service-name>`
- Verify environment variables are set correctly
- Ensure all required API keys are valid
- Check Docker has enough memory allocated
- Test individual services using the health endpoints above