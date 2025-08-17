# 🧪 InsightSphere Testing Guide

## Quick Start - Web-Based Testing

### 1. Start the Services
```bash
cd dev/
./start.sh
```

### 2. Open Test Dashboard
Open your browser and go to: **http://localhost:8000/v1/test/dashboard**

This gives you a beautiful web interface to test all functionality!

## 🔧 Configuration Setup

### Step 1: Get Your Test Data
You'll need these values from your Supabase setup:

1. **Project ID**: From your `projects` table
2. **Document ID**: From your `project_files` table (the PDF you uploaded)
3. **Storage Path**: The path in Supabase Storage where your PDF is stored
4. **Bearer Token**: Your Supabase JWT token

### Step 2: Configure Tests
1. Go to: http://localhost:8000/v1/test/config/form
2. Fill in your actual values
3. Click "Update Configuration"

## 🧪 Available Test Endpoints

### System Health Tests
- **API Health**: http://localhost:8000/v1/test/health
- **Qdrant Status**: http://localhost:8000/v1/test/qdrant  
- **OpenAI Connection**: http://localhost:8000/v1/test/openai

### Document Processing Tests
- **Process Document**: http://localhost:8000/v1/test/process
- **List Documents**: http://localhost:8000/v1/test/documents

### Vector Search Tests
- **Vector Stats**: http://localhost:8000/v1/test/vectors
- **Search Test**: http://localhost:8000/v1/test/search?query=your search term

## 🔄 Auto-Rebuild Feature

Your Docker setup now includes auto-rebuild/reload:

### What Auto-Rebuilds:
- **API (Deno)**: ✅ Auto-reloads on `.ts` file changes
- **Frontend (Vite)**: ✅ Hot Module Replacement on file changes  
- **Go Parser**: ✅ Auto-rebuilds on `.go` file changes
- **Shared/Vector Utils**: ✅ Watched by API service

### How It Works:
1. Save any file in `api/`, `frontend/src/`, or `doc-parser/`
2. Docker automatically detects changes
3. Services reload/rebuild automatically
4. No manual restart needed!

## 📋 Testing Your PDF Processing

### Full Pipeline Test:
1. **Configure**: Set your document details at `/v1/test/config/form`
2. **Check Health**: Verify all services are running
3. **Process Document**: Click "Process Document" test
4. **Verify Storage**: Check vector stats to see chunks were stored
5. **Test Search**: Try searching for content from your PDF

### Example Flow:
```
1. Upload PDF to Supabase Storage ✅ (you already did this)
2. Configure test with your PDF details
3. http://localhost:8000/v1/test/health (should be green)
4. http://localhost:8000/v1/test/qdrant (should show collection info)
5. http://localhost:8000/v1/test/openai (should test embeddings)
6. http://localhost:8000/v1/test/process (should process your PDF)
7. http://localhost:8000/v1/test/vectors (should show chunks stored)
8. http://localhost:8000/v1/test/search?query=test (should find relevant chunks)
```

## 🛠️ Manual Testing (Alternative)

If you prefer manual testing:

### Using curl:
```bash
# Test API health
curl http://localhost:8000/v1/test/health

# Test document processing (replace with your values)
curl -X POST http://localhost:8000/v1/documents/process \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "project_id": "YOUR_PROJECT_ID",
    "document_id": "YOUR_DOCUMENT_ID", 
    "storage_path": "path/to/your/file.pdf"
  }'
```

### Direct Service Access:
- **Qdrant Dashboard**: http://localhost:6333/dashboard
- **API Logs**: `docker compose logs -f api`
- **Parser Logs**: `docker compose logs -f doc-parser`

## 🔍 Troubleshooting

### Common Issues:

**Services not starting?**
- Check Docker is running: `docker info`
- Check logs: `docker compose logs -f`

**Tests failing?**
- Verify configuration at `/v1/test/config`
- Check your Bearer token is valid
- Ensure PDF exists in Supabase Storage

**Auto-rebuild not working?**
- Update Docker Compose: `docker compose version` (need v2.22+)
- Restart with watch: `docker compose down && ./start.sh`

### Success Indicators:
- ✅ All health tests return green
- ✅ Qdrant shows collection with points
- ✅ Vector search returns results
- ✅ Document status changes to "ready" in Supabase

## 🎉 You're Ready!

Once all tests pass, your Milestone 1 is complete:
- ✅ Documents can be processed
- ✅ Text is chunked and embedded  
- ✅ Vectors are stored in Qdrant
- ✅ Search functionality works
- ✅ Auto-rebuild keeps development smooth

Happy testing! 🚀
