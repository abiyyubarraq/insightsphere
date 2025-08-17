# 🧠 InsightSphere - Document Intelligence & RAG Platform

## 🎯 Overview

InsightSphere is a modern document intelligence platform that enables users to upload documents to projects and chat with AI about their content using advanced RAG (Retrieval-Augmented Generation) technology.

### ✨ Key Features

- 🏢 **Multi-Project Architecture** - Organize documents by project with perfect isolation
- 📄 **Advanced PDF Processing** - OCR-based extraction with page-level metadata
- 🔍 **Intelligent Search** - Semantic vector search with source citations
- 🤖 **AI Chat Interface** - Query documents with natural language
- 🔒 **Enterprise Security** - User and project-level data isolation
- ⚡ **High Performance** - Optimized vector storage and retrieval

## 🏗️ Architecture

```
Frontend (SvelteKit) ←→ API (Deno + Hono) ←→ Parser (Go) ←→ Storage (Qdrant + Supabase)
```

### Tech Stack

- **Frontend**: SvelteKit 2 + TypeScript + TailwindCSS + DaisyUI
- **API**: Deno 2.4+ + Hono + TypeScript
- **Parser**: Go 1.22 + Tesseract OCR + poppler-utils
- **Vector DB**: Qdrant (per-project collections)
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **AI Models**: OpenAI GPT + Embeddings, Hugging Face (fallback)

## 🚀 Current Status (Milestone 1 Complete)

### ✅ Implemented Features

#### **Document Processing Pipeline**
- **PDF-to-Image-to-OCR** extraction using Tesseract + poppler-utils
- **Page-aware chunking** with overlap and sentence preservation
- **Multi-model embeddings** (OpenAI → Hugging Face → Hash fallback)
- **Per-project Qdrant collections** for perfect isolation

#### **Collection Strategy**
```typescript
// Per-project isolation
Collection: "insightsphere_user_{userId}_project_{projectId}"

// Stored metadata includes:
{
  documentId: string,
  projectId: string, 
  userId: string,
  pageNumber?: number,
  chunkIndex: number,
  fileName: string,
  fileType: string,
  createdAt: string
}
```

#### **API Endpoints**
- `POST /v1/documents/process` - Process uploaded documents
- `POST /v1/search/query` - Search within project documents
- `GET /v1/test/*` - Comprehensive testing dashboard

#### **Test Infrastructure**
- Browser-based testing dashboard
- Admin mode with Legacy JWT authentication
- Per-project search validation

## 🛠️ Development Setup

### Prerequisites

- **Deno 2.4+** - Runtime for API
- **Go 1.22+** - Document parser service
- **Docker & Docker Compose** - Container orchestration
- **Node.js 18+** - Frontend development

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/insightsphere.git
   cd insightsphere
   ```

2. **Environment Setup**
   ```bash
   # Copy environment template
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

3. **Start Development Environment**
   ```bash
   # Start all services with Docker
   docker compose -f dev/compose.yaml up -d
   
   # Or use the convenience script
   ./dev/start.sh
   ```

4. **Access Services**
   - **API**: http://localhost:8000
   - **Test Dashboard**: http://localhost:8000/v1/test/dashboard
   - **Frontend**: http://localhost:5173 (when implemented)
   - **Qdrant**: http://localhost:6333

### Required Environment Variables

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key

# Hugging Face (Free Alternative)
HUGGINGFACE_API_KEY=hf_your-huggingface-token

# Qdrant Vector Database
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your-qdrant-api-key-if-needed
QDRANT_COLLECTION=insightsphere

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=your-storage-bucket

# Development
LEGACY_JWT_SECRET=your-admin-test-secret
PORT=8000
```

## 🧪 Testing

### Browser-Based Testing

Visit http://localhost:8000/v1/test/dashboard for comprehensive testing:

- **Document Processing**: Test the complete PDF → OCR → Embedding → Qdrant pipeline
- **Project Search**: Query processed documents with natural language
- **System Health**: Check all service connections
- **Vector Statistics**: Monitor collection status and metrics

### API Testing Examples

```bash
# Process a document
curl -X POST http://localhost:8000/v1/documents/process \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "your-project-id",
    "document_id": "your-document-id",
    "storage_path": "path/to/file.pdf"
  }'

# Search documents
curl -X POST http://localhost:8000/v1/search/query \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the key findings?",
    "project_id": "your-project-id",
    "limit": 5
  }'
```

## 📁 Project Structure

```
insightsphere/
├── api/                    # Deno API server
│   ├── lib/               # Core services
│   │   ├── qdrantClient.ts      # Vector database operations
│   │   ├── openaiClient.ts      # OpenAI API integration
│   │   ├── freeEmbeddingClient.ts # Free embedding alternatives
│   │   ├── supabaseClient.ts    # Database & storage operations
│   │   └── chunkText.ts         # Text processing utilities
│   ├── routes/            # API endpoints
│   │   ├── documents/           # Document processing
│   │   ├── search/              # Search functionality
│   │   └── test/                # Testing endpoints
│   └── main.ts           # API server entry point
├── doc-parser/            # Go microservice
│   ├── main.go           # OCR-based document parser
│   └── Dockerfile        # Container configuration
├── frontend/              # SvelteKit frontend (skeleton)
├── shared/                # Shared types and utilities
├── vector-utils/          # Qdrant client utilities
├── dev/                   # Development configuration
│   ├── compose.yaml      # Docker Compose setup
│   └── start.sh          # Development startup script
└── MILESTONE_2_PROMPT.md  # Next development phase
```

## 🎯 Roadmap

### ✅ Milestone 1 - Document Processing Pipeline (Complete)
- [x] PDF OCR extraction with page metadata
- [x] Per-project vector collections
- [x] Multi-model embedding pipeline
- [x] Comprehensive testing infrastructure

### 🚧 Milestone 2 - RAG Query API (Next)
**Target**: Complete AI chat functionality
- [ ] `POST /v1/projects/:id/query` endpoint
- [ ] LLM integration (OpenAI GPT-4o)
- [ ] Source citation system
- [ ] Streaming response support

See [detailed implementation prompt](./MILESTONE_2_PROMPT.md) for technical specifications.

### 📋 Milestone 3 - Frontend Chat UI
- [ ] Project dashboard with "Browse Insights" 
- [ ] Real-time chat interface
- [ ] Citation links with document preview
- [ ] Document section jumping

### 🔒 Milestone 4 - Security & RLS
- [ ] Supabase Row Level Security
- [ ] Enhanced user/project validation
- [ ] Audit logging

### ⚡ Milestone 5 - Async Processing
- [ ] Background document processing
- [ ] Queue management
- [ ] Processing status updates

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: Check the `/api/README.md` for detailed API documentation
- **Issues**: Report bugs and feature requests via GitHub Issues
- **Testing**: Use the test dashboard at `/v1/test/dashboard`

---

**Built with ❤️ for intelligent document processing**