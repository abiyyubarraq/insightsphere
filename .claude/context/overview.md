# Project Overview

**High-level introduction to InsightSphere: vision, features, architecture, and getting started.**

---

## Table of Contents

1. [Project Vision](#project-vision)
2. [Key Features](#key-features)
3. [User Workflows](#user-workflows)
4. [Technology Stack](#technology-stack)
5. [System Architecture](#system-architecture)
6. [Development Status](#development-status)
7. [Getting Started](#getting-started)
8. [Feature Roadmap](#feature-roadmap)
9. [Technical Highlights](#technical-highlights)

---

## Project Vision

### What is InsightSphere?

**InsightSphere** is a modern document intelligence platform that transforms how users interact with their documents. By combining **OCR technology**, **semantic search**, and **AI chat capabilities**, InsightSphere enables natural language queries over document collections with accurate source citations.

### The Problem We're Solving

Traditional document management systems require manual searching, reading, and information extraction. Users face:

1. **Search Limitations**: Keyword search misses semantically similar content
2. **Time Waste**: Reading entire documents to find specific information
3. **Fragmented Knowledge**: Information scattered across multiple documents
4. **No Context**: Search results lack understanding of user intent
5. **Poor Citations**: Difficult to verify AI-generated information sources

### Our Solution

InsightSphere uses **RAG (Retrieval-Augmented Generation)** to:

- ✅ **Upload & Process**: OCR-based text extraction from PDFs/DOCX
- ✅ **Semantic Search**: Find relevant content by meaning, not just keywords
- ✅ **AI Chat**: Ask questions in natural language
- ✅ **Source Citations**: Every answer includes document references
- ✅ **Project Isolation**: Organize documents by project with perfect data separation

### Core Philosophy

1. **Privacy First**: User data never shared between projects or users
2. **Transparency**: Every AI response includes source citations
3. **Performance**: Fast search and processing for real-time interaction
4. **Simplicity**: Intuitive UI with minimal learning curve
5. **Reliability**: Consistent embedding model = predictable results

---

## Key Features

### 1. Multi-Project Organization

**Organize documents into isolated projects with perfect data separation.**

```
User Account
  ├── Project: "Q4 Financial Reports"
  │   ├── Document: Budget-2024.pdf
  │   ├── Document: Revenue-Analysis.pdf
  │   └── Document: Expense-Report.pdf
  │
  ├── Project: "Research Papers"
  │   ├── Document: ML-Paper-2023.pdf
  │   └── Document: RAG-Study.pdf
  │
  └── Project: "Legal Documents"
      └── Document: Contract-Template.docx
```

**Benefits**:
- Perfect isolation (Qdrant collections per project)
- Context-aware search (search within project only)
- Easy management (delete project = delete all data)

### 2. Advanced PDF Processing

**OCR-based extraction with page-level metadata preservation.**

#### Pipeline
```
PDF Upload
  ↓
PDF → Images (poppler-utils)
  ↓
Images → Text (Tesseract OCR)
  ↓
Text → Chunks (800 tokens, 100 overlap)
  ↓
Chunks → Embeddings (OpenAI text-embedding-3-small)
  ↓
Store in Qdrant (with metadata)
```

#### Metadata Preserved
- **Page numbers**: Know where information came from
- **File name**: Source document identification
- **Chunk index**: Order preservation within document
- **Timestamps**: Track when processed

### 3. Intelligent Semantic Search

**Find relevant content by meaning, not just keywords.**

#### Example: Keyword vs. Semantic Search

**Query**: "How did we perform financially last quarter?"

**Keyword Search** (traditional):
- Matches: "financial", "quarter", "perform"
- Misses: "Q3 revenue increased 23%" (no keywords match)

**Semantic Search** (InsightSphere):
- Understands intent: financial performance
- Finds: "Q3 revenue increased 23%", "Quarterly growth exceeded targets"
- Returns: Top 10 relevant chunks with similarity scores

#### How It Works
```typescript
// 1. User query
const query = "How did we perform financially last quarter?";

// 2. Generate query embedding (1536 dimensions)
const queryEmbedding = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: query
});

// 3. Search Qdrant (cosine similarity)
const results = await qdrant.search(collectionName, {
  vector: queryEmbedding.data[0].embedding,
  limit: 10,
  score_threshold: 0.7  // Only return relevant results
});

// 4. Return results with sources
// [
//   { text: "Q3 revenue increased by 23%...", score: 0.89, page: 3, file: "Q3-Report.pdf" },
//   { text: "Quarterly growth exceeded targets...", score: 0.85, page: 1, file: "Summary.pdf" }
// ]
```

### 4. AI Chat Interface

**Ask questions and get answers grounded in your documents.**

#### Example Conversation

**User**: "Summarize the key findings from the Q3 report"

**InsightSphere**:
1. Searches for relevant chunks about "Q3 findings"
2. Builds context from top 5 results
3. Sends to GPT-4o-mini with context
4. Returns answer with citations

**AI Response**:
> The Q3 report shows strong performance with revenue increasing 23% year-over-year. Key findings include:
>
> 1. **Revenue Growth**: 23% increase compared to Q3 2023 [Source: Q3-Report.pdf, Page 3]
> 2. **Cost Reduction**: Operating expenses decreased by 12% [Source: Q3-Report.pdf, Page 5]
> 3. **Market Expansion**: Entered 3 new markets in APAC region [Source: Strategy-Update.pdf, Page 2]
>
> The report concludes that growth is sustainable and recommends continued investment in APAC expansion.

**User**: "What were the main cost reductions?"

**InsightSphere**: (continues conversation with context...)

### 5. Enterprise Security

**User and project-level data isolation with Row-Level Security.**

#### Security Layers

1. **Authentication**: Supabase Auth (JWT tokens)
2. **Authorization**: Every API call validates user ownership
3. **Database RLS**: PostgreSQL Row-Level Security policies
4. **Collection Isolation**: Per-project Qdrant collections
5. **Storage Isolation**: Supabase Storage with user-based paths

#### Example: Authorization Flow
```typescript
// User requests document
GET /v1/documents/doc-123
Authorization: Bearer <jwt>

// API validates:
1. JWT is valid (Supabase Auth)
   ↓
2. Extract userId from JWT
   ↓
3. Query document: WHERE id = 'doc-123' AND user_id = userId
   ↓
4. If document.user_id !== userId → 403 Forbidden
   ↓
5. Return document (only if owned)
```

---

## User Workflows

### Workflow 1: Upload & Process Document

```
1. User logs in (Supabase Auth)
   ↓
2. User creates/selects project
   ↓
3. User uploads PDF file
   ↓ (Frontend)
4. File → Supabase Storage
   ↓
5. Create document record (PostgreSQL)
   ↓
6. Trigger processing (POST /v1/documents/process)
   ↓ (API)
7. Download file from storage
   ↓
8. Call Parser service (POST /parse/pdf)
   ↓ (Parser - Go)
9. PDF → Images → OCR → Text (Tesseract)
   ↓
10. Return pages[] to API
    ↓ (API)
11. Chunk text (800 tokens, 100 overlap)
    ↓
12. Generate embeddings (OpenAI)
    ↓
13. Store in Qdrant (per-project collection)
    ↓
14. Update document status → "completed"
    ↓
15. User sees processing complete ✅
```

**Time**: ~10-30 seconds for 50-page PDF

### Workflow 2: Search Documents

```
1. User enters search query
   "What are the budget allocations?"
   ↓ (Frontend)
2. POST /v1/search/query
   ↓ (API)
3. Generate query embedding (OpenAI)
   ↓
4. Search Qdrant collection (project-specific)
   ↓
5. Return top 10 results with scores
   ↓ (Frontend)
6. Display results with:
   - Text snippet
   - Source file name
   - Page number
   - Similarity score
```

**Time**: <1 second

### Workflow 3: AI Chat

```
1. User types message in chat
   "Summarize the key points"
   ↓ (Frontend)
2. POST /v1/chat/completion
   ↓ (API)
3. Search for relevant chunks (same as Workflow 2)
   ↓
4. Build context from top results
   ↓
5. Create prompt:
   System: "You are a helpful assistant..."
   Context: [Retrieved chunks with sources]
   User: "Summarize the key points"
   ↓
6. Call OpenAI GPT-4o-mini (streaming)
   ↓
7. Stream response to frontend (SSE)
   ↓ (Frontend)
8. Display response with source citations
```

**Time**: 2-5 seconds (streaming starts immediately)

---

## Technology Stack

### Why These Technologies?

| Technology | Reason |
|-----------|--------|
| **Svelte 5** | Best-in-class reactivity with runes, minimal bundle size |
| **SvelteKit** | Full-stack framework with SSR, file-based routing |
| **Deno** | Secure by default, built-in TypeScript, modern runtime |
| **Hono** | Lightweight, edge-ready, perfect for Deno |
| **Go + Tesseract** | High-performance OCR processing with concurrency |
| **Qdrant** | Purpose-built vector database for semantic search |
| **Supabase** | Complete backend (PostgreSQL, Auth, Storage) |
| **OpenAI** | Industry-leading embeddings and chat models |
| **TailwindCSS v4** | Utility-first CSS with excellent DX |
| **DaisyUI** | Pre-built components for rapid development |

### Technology Comparison

#### Why Svelte 5 over React/Vue?

| Feature | Svelte 5 | React 19 | Vue 3 |
|---------|----------|----------|-------|
| **Reactivity** | Compiler + Runes | Hooks | Composition API |
| **Bundle Size** | ~20 KB | ~50 KB | ~35 KB |
| **Learning Curve** | Low | Medium | Medium |
| **Performance** | Excellent | Good | Good |
| **Type Safety** | TypeScript native | TypeScript support | TypeScript support |

#### Why Deno over Node.js?

| Feature | Deno | Node.js |
|---------|------|---------|
| **TypeScript** | Built-in | Requires setup |
| **Security** | Explicit permissions | All access by default |
| **Modules** | ES modules, URLs | CommonJS, npm |
| **Standard Library** | Built-in | Third-party |
| **Runtime** | Modern V8 | Modern V8 |

#### Why Qdrant over Pinecone/Weaviate?

| Feature | Qdrant | Pinecone | Weaviate |
|---------|--------|----------|----------|
| **Self-Hosting** | ✅ Docker | ❌ Cloud only | ✅ Docker |
| **Performance** | Excellent | Excellent | Good |
| **Collections** | Unlimited | Limited by plan | Unlimited |
| **Pricing** | Free (self-host) | $70+/month | Free (self-host) |
| **Filtering** | Rich filtering | Basic | Good |

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                          User                               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Frontend (SvelteKit)                      │
│  - User Interface                                           │
│  - State Management (Svelte 5 Runes)                       │
│  - Authentication (Supabase Client)                         │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/REST + JWT
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                     API (Deno + Hono)                       │
│  - Business Logic Orchestration                             │
│  - Authentication & Authorization                           │
│  - RAG Pipeline Management                                  │
└──┬───────────┬──────────────┬──────────────┬───────────────┘
   │           │              │              │
   │           │              │              │
   ▼           ▼              ▼              ▼
┌──────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐
│Parser│  │ Qdrant  │  │ Supabase │  │  OpenAI  │
│ (Go) │  │(Vector) │  │(DB+Auth) │  │  (LLM)   │
└──────┘  └─────────┘  └──────────┘  └──────────┘
```

### Service Responsibilities

| Service | Responsibility | Tech Stack |
|---------|---------------|------------|
| **Frontend** | UI, UX, client-side state | Svelte 5, SvelteKit, TailwindCSS |
| **API** | Orchestration, RAG pipeline | Deno, Hono, TypeScript |
| **Parser** | OCR text extraction | Go, Tesseract, poppler-utils |
| **Qdrant** | Vector storage & search | Qdrant (Rust-based) |
| **Supabase** | Database, auth, storage | PostgreSQL, Auth, Storage |
| **OpenAI** | Embeddings & chat completion | GPT-4o-mini, text-embedding-3-small |

### Data Flow: Document Processing

```
User Upload (PDF)
  ↓
Supabase Storage (files)
  ↓
API receives path
  ↓
API → Parser (HTTP)
  ↓
Parser: PDF → Images → Text
  ↓
API: Text → Chunks
  ↓
API → OpenAI (embeddings)
  ↓
API → Qdrant (vector storage)
  ↓
API → Supabase (update status)
  ↓
Frontend: Display success
```

---

## Development Status

### Milestone 1 (COMPLETED) ✅

#### Backend Infrastructure
- ✅ Deno API server with Hono
- ✅ Go parser service with Tesseract OCR
- ✅ Qdrant vector database integration
- ✅ Supabase PostgreSQL integration
- ✅ OpenAI embeddings & chat integration

#### Document Processing
- ✅ PDF-to-Image-to-OCR pipeline
- ✅ Page-aware chunking (800 tokens, 100 overlap)
- ✅ Embedding generation (OpenAI text-embedding-3-small)
- ✅ Per-project Qdrant collections

#### Search & Query
- ✅ Semantic vector search
- ✅ Query embedding generation
- ✅ Result ranking by similarity score
- ✅ Metadata filtering (by project)

#### Testing Infrastructure
- ✅ Browser-based testing dashboard
- ✅ Document processing tests
- ✅ Search query tests
- ✅ System health checks

### Milestone 2 (IN PROGRESS) 🚧

#### Frontend Development
- 🚧 User authentication UI (Supabase Auth)
- 🚧 Project management interface
- 🚧 Document upload & list views
- 🚧 Search interface with filters
- 🚧 AI chat interface with streaming

#### Backend Enhancements
- 🚧 Document summarization endpoint
- 🚧 Batch document processing
- 🚧 Error handling improvements
- 🚧 Rate limiting middleware

#### User Experience
- 🚧 Real-time processing status updates
- 🚧 Upload progress indicators
- 🚧 Search result highlighting
- 🚧 Chat history persistence

### Milestone 3 (PLANNED) 📋

#### Advanced Features
- 📋 DOCX document support
- 📋 Multi-document queries
- 📋 Advanced search filters (date, type, etc.)
- 📋 Export search results
- 📋 Document versioning

#### Performance & Scalability
- 📋 Background job queue (Redis + BullMQ)
- 📋 Caching layer for frequent queries
- 📋 Horizontal API scaling
- 📋 CDN integration for frontend

#### Analytics & Monitoring
- 📋 User analytics dashboard
- 📋 Processing metrics
- 📋 Search quality metrics
- 📋 Error tracking (Sentry)

---

## Getting Started

### Prerequisites

- **Deno 2.5+** - [Install Deno](https://deno.land/)
- **Go 1.24+** - [Install Go](https://go.dev/dl/)
- **Docker & Docker Compose** - [Install Docker](https://www.docker.com/get-started)
- **Node.js 18+** (for frontend) - [Install Node](https://nodejs.org/)

### Quick Start (5 minutes)

#### 1. Clone Repository

```bash
git clone https://github.com/yourusername/insightsphere.git
cd insightsphere
```

#### 2. Environment Setup

```bash
# Copy environment template
cp dev/.env.example dev/.env

# Edit .env with your API keys
nano dev/.env
```

**Required Variables**:
```bash
# OpenAI (required for embeddings & chat)
OPENAI_API_KEY=sk-your-openai-api-key

# Supabase (required for database & auth)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=documents

# Qdrant (local by default)
QDRANT_URL=http://qdrant:6333
QDRANT_COLLECTION=insightsphere

# Development
LEGACY_JWT_SECRET=your-dev-secret
PORT=8000
```

#### 3. Start Services

```bash
# Start all services with Docker Compose
cd dev
docker compose up -d

# Or use the convenience script
./start.sh
```

**Services Started**:
- ✅ Qdrant (port 6333)
- ✅ Parser (port 8080)
- ✅ API (port 8000)

#### 4. Test the System

Visit the test dashboard:
```
http://localhost:8000/v1/test/dashboard
```

**Features**:
- Document processing test
- Search query test
- System health check
- Collection statistics

#### 5. Develop Frontend (Optional)

```bash
cd frontend
npm install
npm run dev
```

Visit: `http://localhost:5173`

### Development Workflow

```bash
# Watch mode for API (auto-reload)
cd api
deno task dev

# Watch mode for Parser (auto-rebuild)
cd doc-parser
go run main.go

# Frontend dev server
cd frontend
npm run dev
```

---

## Feature Roadmap

### Q1 2025: Foundation (Milestone 1) ✅

- ✅ Core RAG pipeline
- ✅ PDF processing with OCR
- ✅ Semantic search
- ✅ Per-project collections
- ✅ Testing infrastructure

### Q2 2025: User Experience (Milestone 2) 🚧

- 🚧 Complete frontend UI
- 🚧 User authentication
- 🚧 Project & document management
- 🚧 AI chat interface
- 🚧 Document summarization

### Q3 2025: Advanced Features (Milestone 3) 📋

- 📋 DOCX support
- 📋 Multi-document queries
- 📋 Advanced search filters
- 📋 Background job processing
- 📋 Performance optimization

### Q4 2025: Enterprise & Scale (Milestone 4) 📋

- 📋 Team collaboration features
- 📋 Admin dashboard
- 📋 Audit logging
- 📋 SSO integration
- 📋 High availability deployment

---

## Technical Highlights

### 1. Embedding Consistency

**Critical Rule**: Same embedding model for documents AND queries.

```typescript
// ✅ Correct
const EMBEDDING_MODEL = "text-embedding-3-small";

// Documents
const docEmbeddings = await openai.embeddings.create({
  model: EMBEDDING_MODEL,
  input: chunks
});

// Queries
const queryEmbedding = await openai.embeddings.create({
  model: EMBEDDING_MODEL,
  input: query
});
```

**Why?** Different models = incompatible vector spaces = zero results.

### 2. Per-Project Collections

**Architecture**: Each project gets its own Qdrant collection.

**Collection Name**:
```
insightsphere_user_{userId}_project_{projectId}
```

**Benefits**:
- Perfect data isolation
- Faster searches (smaller collections)
- Easy deletion (drop collection)
- Natural authorization boundary

### 3. Sentence-Boundary Chunking

**Algorithm**: Preserve sentence boundaries for context.

```typescript
// ❌ Bad: Arbitrary character splits
"The revenue increased by 23%. Thi"  // ← Cuts mid-sentence!
"s growth is attributed to..."

// ✅ Good: Sentence-aware chunking
"The revenue increased by 23%. This growth is attributed to strong Q3 performance."
"This growth is attributed to strong Q3 performance. The marketing campaign..."
```

### 4. Context-Based Timeouts

**Go Parser**: 30-second timeout per document.

```go
ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
defer cancel()

pages, err := extractTextFromPDF(ctx, filePath)
if err != nil {
  if errors.Is(err, context.DeadlineExceeded) {
    c.JSON(http.StatusRequestTimeout, gin.H{"error": "processing timeout"})
    return
  }
  c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
  return
}
```

---

## Related Documentation

### For Development
- [Architecture](architecture.md) - System design & service organization
- [Design Principles](design-principles.md) - Coding standards & best practices
- [CLAUDE.md](../CLAUDE.md) - Quick reference for AI agents

### For Technical Deep-Dives
- [RAG Pipeline](rag-pipeline.md) - Complete RAG implementation details
- [Embedding Strategy](embedding-strategy.md) - Embedding consistency rules
- [Qdrant](qdrant.md) - Vector database operations
- [Supabase](supabase.md) - Database, auth, and storage patterns

### For Framework-Specific Patterns
- [Svelte 5 Patterns](svelte5-patterns.md) - Svelte runes and component patterns
- [Deno Conventions](deno-conventions.md) - Deno API development patterns
- [Go Patterns](go-patterns.md) - Go service and OCR patterns

---

## Support & Contribution

### Getting Help

- **Documentation**: Check `.claude/context/` for detailed guides
- **Issues**: Report bugs via GitHub Issues
- **Testing**: Use `/v1/test/dashboard` for troubleshooting

### Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for:
- Code of conduct
- Development setup
- Pull request process
- Coding standards

---

**Last Updated**: 2025-11-29
**Project Status**: Milestone 2 (In Progress)
**Maintained By**: InsightSphere Team
