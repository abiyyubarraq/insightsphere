# InsightSphere - Quick Reference Guide

**Document Version**: 1.0
**Last Updated**: 2025-11-29
**Main Branch**: master

---

## 🎯 Project Overview

InsightSphere is a document intelligence platform that enables users to upload documents to projects and interact with AI using advanced RAG (Retrieval-Augmented Generation) technology.

### Current Status
**Milestone 1 Complete** ✅
- OCR-based PDF/DOCX processing pipeline
- Per-project vector storage in Qdrant
- OpenAI embedding generation (text-embedding-3-small)
- RAG-powered search and chat
- Browser-based testing dashboard

### Key Features
- 📁 **Multi-Project Organization** - Perfect data isolation per project
- 🔍 **Semantic Search** - Vector-based document retrieval
- 💬 **AI Chat Interface** - Natural language queries with citations
- 📄 **OCR Processing** - PDF-to-Image-to-Text extraction
- 🔒 **Enterprise Security** - User and project-level isolation

---

## 🏗️ Architecture Overview

### Monorepo Structure

```
insightsphere/
├── frontend/        # SvelteKit 2 + Svelte 5 app
├── api/             # Deno 2.5+ + Hono REST API
├── doc-parser/      # Go 1.24 OCR microservice
├── shared/          # TypeScript types & utilities
├── vector-utils/    # Qdrant client helpers
├── dev/             # Docker Compose for local dev
└── docker/          # Production deployment configs
```

### Tech Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Svelte 5 + SvelteKit 2 | Modern reactive UI |
| **Styling** | TailwindCSS v4 + DaisyUI | Utility-first CSS + components |
| **Icons** | Lucide Svelte | Consistent icon system |
| **API** | Deno 2.5+ + Hono | Fast REST API server |
| **Parser** | Go 1.24 + Tesseract | OCR document extraction |
| **Vector DB** | Qdrant | Semantic search |
| **Database** | Supabase PostgreSQL | User data + auth |
| **Storage** | Supabase Storage | File uploads |
| **AI** | OpenAI GPT + Embeddings | LLM + vector generation |

---

## 📁 Directory Structure

```
frontend/
├── src/
│   ├── lib/
│   │   └── components/
│   │       ├── common/              # Shared UI components
│   │       └── home/                # Main app components
│   ├── routes/                      # SvelteKit file-based routing
│   │   ├── +page.svelte            # Landing page
│   │   ├── project/[id]/           # Dynamic project routes
│   │   ├── login/ & signup/        # Auth pages
│   │   └── demo/                    # Demo route
│   ├── stores/                      # Svelte stores (auth, project)
│   ├── services/                    # API clients (supabase)
│   └── app.css                      # Global styles

api/
├── lib/                             # Core services
│   ├── chunkText.ts                # Text chunking (800 tokens, 100 overlap)
│   ├── embeddingClient.ts          # HuggingFace embeddings (development)
│   ├── openaiClient.ts             # OpenAI embeddings + chat (production)
│   ├── qdrantClient.ts             # Vector database operations
│   ├── ragService.ts               # RAG orchestration
│   ├── supabaseClient.ts           # Database + storage
│   └── llmClient.ts                # LLM integrations
├── routes/                          # API endpoints
│   ├── documents/process.ts        # Document processing pipeline
│   ├── documents/generateSummary.ts # AI summarization
│   ├── search/query.ts             # Vector search
│   ├── projects/query.ts           # Project-level queries
│   ├── chat/send.ts                # Conversational RAG
│   └── test/                        # Testing dashboard
└── main.ts                          # API server entry point

doc-parser/
├── main.go                          # HTTP server + OCR logic
├── handlers/                        # PDF/DOCX parsers
└── utils/                           # Helper functions

shared/
├── types/                           # TypeScript interfaces
│   ├── chat.ts                     # Chat message types
│   └── index.ts                    # Document, project types
└── constants/                       # Shared constants
```

---

## 🔑 Key Patterns

### 1. Svelte 5 Runes (Frontend)

Svelte 5 introduces "runes" - a new reactive system replacing stores for component-level state.

#### State Management
```typescript
// Reactive state (replaces: let count = 0)
let count = $state(0);

// Derived state (replaces: $: doubled = count * 2)
let doubled = $derived(count * 2);

// Side effects (replaces: $: { console.log(count) })
$effect(() => {
  console.log('Count changed:', count);
});
```

#### Component Props
```typescript
// Define props with types
interface Props {
  userId: string;
  onComplete?: () => void;
}

// Use $props() to receive props
let { userId, onComplete = () => {} } = $props<Props>();
```

#### Two-Way Binding
```typescript
// Parent component
let {
  leftSidebarOpen = $bindable(),
  rightSidebarOpen = $bindable()
} = $props<{
  leftSidebarOpen?: boolean;
  rightSidebarOpen?: boolean;
}>();

// Child component can modify these values
```

#### Event Handling
```svelte
<!-- Svelte 5: Inline handlers (no 'on:' directive) -->
<button onclick={handleClick}>Click me</button>
<input onkeydown={handleKeyDown} />
```

**Real Example** (from [MainContent.svelte:37-47](frontend/src/lib/components/home/MainContent.svelte#L37-L47)):
```typescript
// Chat state with runes
let chatMessages: ChatMessage[] = $state([]);
let userInput = $state('');
let chatLoading = $state(false);
let chatError = $state('');
let messagesContainer: HTMLDivElement | undefined = $state();

// Auto-scroll effect
$effect(() => {
  if (messagesContainer && chatMessages.length > 0) {
    messagesContainer?.scrollTo({
      top: messagesContainer.scrollHeight,
      behavior: 'smooth',
    });
  }
});
```

### 2. Deno Import Patterns (API)

#### ES Modules with npm: prefix
```typescript
// Deno uses npm: prefix for Node packages
import { Hono } from "hono";
import OpenAI from "openai";
import { QdrantClient } from "qdrant-js";
```

#### Import Maps (deno.jsonc)
```jsonc
{
  "imports": {
    "openai": "npm:openai@^4.0.0",
    "hono": "npm:hono@^4.0.0",
    "@huggingface/inference": "npm:@huggingface/inference@^4.7.1"
  }
}
```

#### Permissions Model
```bash
# Explicit permissions required
deno run --allow-net --allow-env --allow-read --allow-write main.ts
```

### 3. Go OCR Patterns (Parser)

#### Gin HTTP Framework
```go
// Route definition
router := gin.Default()
router.POST("/parse/pdf", handlers.ParsePDF)
router.POST("/parse/docx", handlers.ParseDOCX)
```

#### Context for Timeouts
```go
// Create context with timeout
ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
defer cancel()

// Use context in operations
result, err := processDocument(ctx, filePath)
```

#### Goroutines for Parallel Processing
```go
// Process PDF pages in parallel
var wg sync.WaitGroup
results := make([]PageResult, len(pages))

for i, page := range pages {
  wg.Add(1)
  go func(index int, p Page) {
    defer wg.Done()
    results[index] = processPage(p)
  }(i, page)
}

wg.Wait()
```

### 4. RAG Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Document Upload (Frontend → Supabase Storage)               │
└────────────────────────┬────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Process Request (API: POST /v1/documents/process)           │
│    - Validate user & project access                            │
│    - Download file from storage (service key)                  │
└────────────────────────┬────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. OCR Extraction (Go Parser: POST /parse/pdf)                 │
│    - PDF → Images (poppler-utils)                              │
│    - Images → Text (Tesseract OCR)                             │
│    - Returns: { text, pages[], metadata }                      │
└────────────────────────┬────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Text Chunking (chunkText.ts)                                │
│    - Chunk size: 800 tokens                                    │
│    - Overlap: 100 tokens                                       │
│    - Preserve sentence boundaries                              │
│    - Maintain page metadata                                    │
└────────────────────────┬────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. Embedding Generation (openaiClient.ts)                      │
│    - Model: text-embedding-3-small                             │
│    - Dimensions: 1536                                           │
│    - Batch processing for efficiency                           │
│    - NO FALLBACK (consistency required)                        │
└────────────────────────┬────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. Vector Storage (qdrantClient.ts)                            │
│    - Collection: insightsphere_user_{userId}_project_{projId}  │
│    - Store: vectors + content + metadata                       │
│    - Metadata: documentId, projectId, userId, pageNumber, etc. │
└────────────────────────┬────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. Status Update (Supabase)                                    │
│    - Set document status: "ready"                              │
│    - Store processing metadata (chunks, tokens, timing)        │
└─────────────────────────────────────────────────────────────────┘
```

### 5. Qdrant Collection Strategy

**Per-Project Isolation** (Current Implementation):
```typescript
// Collection naming convention
Collection: `insightsphere_user_{userId}_project_{projectId}`

// Example
"insightsphere_user_a1b2c3_project_x7y8z9"

// Benefits
✅ Perfect data isolation
✅ Easier to delete project data
✅ Better for multi-tenancy
✅ Clearer access control

// Trade-offs
⚠️ More collections to manage
⚠️ Cannot search across projects
```

**Collection Configuration**:
```typescript
{
  vectors: {
    size: 1536,              // OpenAI text-embedding-3-small
    distance: "Cosine"       // Similarity metric
  }
}
```

### 6. Text Chunking Configuration

**From** [chunkText.ts:189-193](api/lib/chunkText.ts#L189-L193):
```typescript
const textChunks = chunkPages(pageContents, {
  maxChunkSize: 800,         // Target tokens per chunk
  overlap: 100,              // Token overlap between chunks
  preserveSentences: true    // Keep sentences intact
});
```

**Why These Values?**
- **800 tokens**: Balances context vs. precision (fits in 4K context window ~5 chunks)
- **100 overlap**: Prevents information loss at chunk boundaries
- **Sentence preservation**: Maintains semantic coherence

### 7. Embedding Strategy

**CRITICAL**: Embedding consistency is essential for RAG to work.

**Production Strategy** (from [process.ts:202-232](api/routes/documents/process.ts#L202-L232)):
```typescript
// ALWAYS use OpenAI for production
const embeddingModel = "text-embedding-3-small";
const embeddings = await openaiClient.generateBatchEmbeddings(
  chunkTexts,
  "text-embedding-3-small"  // 1536 dimensions
);

// NO FALLBACK allowed
// Documents and queries MUST use the same model
// Dimension mismatch = zero search results
```

**Why No Fallback?**
- Query embeddings must match document embeddings
- Different models = different dimensions = incompatible
- Better to fail than to create unusable data

---

## 🔧 Common Tasks

### Start Development Environment

```bash
# Option 1: Docker Compose (recommended)
cd dev
docker compose up -d

# Option 2: Manual startup
# Terminal 1: Start Qdrant
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant

# Terminal 2: Start Go parser
cd doc-parser
go run main.go

# Terminal 3: Start API
cd api
deno task dev

# Terminal 4: Start frontend
cd frontend
npm run dev
```

### Access Services

- **Frontend**: http://localhost:5173
- **API**: http://localhost:8000
- **Test Dashboard**: http://localhost:8000/v1/test/dashboard
- **Qdrant UI**: http://localhost:6333/dashboard
- **Go Parser**: http://localhost:8080

### Testing the RAG Pipeline

```bash
# 1. Process a document
curl -X POST http://localhost:8000/v1/documents/process \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "project-uuid",
    "document_id": "document-uuid",
    "storage_path": "userId/projectId/filename.pdf"
  }'

# 2. Search documents
curl -X POST http://localhost:8000/v1/search/query \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the key findings?",
    "project_id": "project-uuid",
    "limit": 5
  }'

# 3. Chat with documents
curl -X POST http://localhost:8000/v1/chat/send \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "project-uuid",
    "message": "Summarize the main conclusions",
    "conversation_id": "optional-conversation-uuid"
  }'
```

---

## 🎨 Styling with TailwindCSS + DaisyUI

### DaisyUI Theme Tokens

```svelte
<!-- Use theme tokens instead of hardcoded colors -->
<button class="btn btn-primary">Primary Button</button>
<div class="bg-base-100 text-base-content">Content</div>
<div class="border-primary bg-primary/10">Subtle primary</div>
```

### Custom Theme (tailwind.config.js)

```javascript
daisyui: {
  themes: [
    {
      insightsphere: {
        primary: "#7C3AED",      // Purple
        secondary: "#10B981",    // Green
        accent: "#F59E0B",       // Amber
        neutral: "#1F2937",      // Dark gray
        "base-100": "#0F172A",   // Very dark blue
        info: "#3ABFF8",
        success: "#36D399",
        warning: "#FBBD23",
        error: "#F87272",
      },
    },
  ],
}
```

---

## 🚫 Critical Constraints

### 1. Embedding Consistency (CRITICAL ⚠️)
```typescript
// ❌ NEVER mix embedding models
// Documents processed with text-embedding-3-small
// Queries must also use text-embedding-3-small

// ✅ Correct
const queryEmbedding = await openaiClient.generateEmbedding({
  text: query,
  model: "text-embedding-3-small"  // MUST match documents
});

// ❌ Wrong - will return zero results
const queryEmbedding = await embeddingClient.generateHuggingFaceEmbedding(query);
// Different model = different dimensions = incompatible
```

### 2. No Full Document Logging
```typescript
// ❌ Never log full document content
console.log("Processing document:", fullDocumentText);  // BAD

// ✅ Log IDs and summaries only
console.log("Processing document:", {
  documentId,
  fileName,
  textLength: text.length,
  chunkCount: chunks.length
});
```

### 3. File Size Limits
```typescript
// Prevent uploads >100MB early
// Both frontend validation AND backend validation
const MAX_FILE_SIZE = 100 * 1024 * 1024;  // 100MB

if (file.size > MAX_FILE_SIZE) {
  throw new Error("File size exceeds 100MB limit");
}
```

### 4. TypeScript Strict Mode
```json
// deno.jsonc & tsconfig.json
{
  "compilerOptions": {
    "strict": true,           // Enable all strict checks
    "noImplicitAny": true,    // No implicit 'any' types
    "strictNullChecks": true  // Null safety
  }
}
```

### 5. Technology Stack Constraints
```typescript
// ❌ Do NOT suggest
- Python solutions
- Node.js (use Deno)
- JavaScript (use TypeScript)
- Different UI libraries (use DaisyUI)

// ✅ ONLY use
- Deno 2.5+ (API)
- TypeScript (Frontend + API)
- Svelte 5 + SvelteKit 2 (Frontend)
- Go 1.24+ (Parser)
- TailwindCSS v4 + DaisyUI (Styling)
```

### 6. User Isolation
```typescript
// ALWAYS validate user ownership
// Before processing ANY operation

// ✅ Correct
const document = await supabaseService.getDocument(documentId, userId);
const hasAccess = await supabaseService.validateProjectAccess(projectId, userId);

// ❌ Wrong - no user validation
const document = await supabaseService.getDocumentAsAdmin(documentId);
```

### 7. Collection Management
```typescript
// ALWAYS use per-project collections
// ALWAYS include userId + projectId in metadata
// ALWAYS filter by projectId in searches

await qdrantService.upsertChunks(chunks, {
  useProjectCollection: true  // Required
});

const results = await qdrantService.searchSimilar(queryVector, {
  userId,                     // Required
  projectId,                  // Required for filtering
  useProjectCollection: true  // Required
});
```

---

## 🔗 Path Aliases & Imports

### Frontend (SvelteKit)
```typescript
// $lib alias configured in svelte.config.js
import { MyComponent } from '$lib/components/common/MyComponent.svelte';
import { authStore } from '$lib/stores/auth';
import { myService } from '$lib/services/myService';
```

### API (Deno)
```typescript
// Relative imports (no path aliases in Deno)
import { qdrantService } from "../lib/qdrantClient.ts";
import { openaiClient } from "../lib/openaiClient.ts";

// NPM packages use npm: prefix
import { Hono } from "hono";
import OpenAI from "openai";
```

### Go (Parser)
```go
// Module imports
import (
  "github.com/gin-gonic/gin"
  "insightsphere/doc-parser/handlers"
  "insightsphere/doc-parser/utils"
)
```

---

## 📚 Additional Resources

For deeper documentation, see:

- **Architecture Deep Dive**: [context/architecture.md](context/architecture.md)
- **RAG Pipeline Details**: [context/rag-pipeline.md](context/rag-pipeline.md)
- **Embedding Strategy**: [context/embedding-strategy.md](context/embedding-strategy.md)
- **Qdrant Patterns**: [context/qdrant.md](context/qdrant.md)
- **Design Principles**: [context/design-principles.md](context/design-principles.md)
- **Svelte 5 Patterns**: [context/svelte5-patterns.md](context/svelte5-patterns.md)
- **Deno Conventions**: [context/deno-conventions.md](context/deno-conventions.md)
- **Go Patterns**: [context/go-patterns.md](context/go-patterns.md)
- **Supabase Integration**: [context/supabase.md](context/supabase.md)
- **Multi-Service Coordination**: [context/multiservice.md](context/multiservice.md)
- **Project Overview**: [context/overview.md](context/overview.md)

### Development Guides

- **Startup Guide**: [dev/STARTUP_GUIDE.md](dev/STARTUP_GUIDE.md)
- **Testing Guide**: [dev/TESTING_GUIDE.md](dev/TESTING_GUIDE.md)
- **Troubleshooting**: [dev/TROUBLESHOOTING.md](dev/TROUBLESHOOTING.md)
- **Processing Pipeline**: [api/README_PROCESSING.md](api/README_PROCESSING.md)

---

## 🤖 Claude Code Agents

Specialized AI agents are available in [.claude/agents/](.claude/agents/) for specific tasks:

- **code-reviewer** - Code quality assurance
- **design-reviewer** - Architecture validation
- **planning-specialist** - Feature breakdown & coordination
- **research-specialist** - Technical research & investigation
- **senior-developer** - Full-stack implementation
- **ui-specialist** - Frontend development & UI/UX
- **rag-specialist** - RAG pipeline optimization
- **embedding-specialist** - Vector & embedding expertise
- **go-service-specialist** - Go microservice development
- **microservices-coordinator** - Multi-service orchestration

---

**Built with ❤️ for intelligent document processing**
