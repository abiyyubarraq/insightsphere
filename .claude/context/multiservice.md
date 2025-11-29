# Multi-Service Coordination Guide

**Comprehensive guide to orchestrating frontend, API, parser, Qdrant, and Supabase services in InsightSphere.**

---

## Table of Contents

1. [Service Overview](#service-overview)
2. [Communication Patterns](#communication-patterns)
3. [Error Handling](#error-handling)
4. [Retry Strategies](#retry-strategies)
5. [Circuit Breakers](#circuit-breakers)
6. [Health Checks](#health-checks)
7. [Timeouts & Cancellation](#timeouts--cancellation)
8. [Distributed Tracing](#distributed-tracing)
9. [Docker Compose Configuration](#docker-compose-configuration)
10. [Deployment Strategies](#deployment-strategies)

---

## Service Overview

### Service Topology

```
┌──────────────┐
│   Frontend   │  (Port 5173)
│  SvelteKit   │
└──────┬───────┘
       │ HTTP/REST + JWT
       ▼
┌──────────────┐
│   API (Deno) │  (Port 8000)
│     Hono     │
└──┬────┬────┬─┘
   │    │    │
   │    │    └──────────────┐
   │    │                   │
   │    │                   ▼
   │    │            ┌──────────────┐
   │    │            │   OpenAI     │
   │    │            │   API        │
   │    │            └──────────────┘
   │    │
   │    ▼
   │ ┌──────────────┐
   │ │  Parser (Go) │  (Port 8080)
   │ │  Tesseract   │
   │ └──────────────┘
   │
   ├────────┬──────────┐
   │        │          │
   ▼        ▼          ▼
┌───────┐ ┌──────┐ ┌─────────┐
│Qdrant │ │Supa  │ │ OpenAI  │
│Vector │ │base  │ │   API   │
└───────┘ └──────┘ └─────────┘
```

### Service Responsibilities

| Service | Port | Protocol | Responsibility |
|---------|------|----------|----------------|
| **Frontend** | 5173 | HTTP | User interface, client-side state |
| **API** | 8000 | HTTP | Business logic orchestration |
| **Parser** | 8080 | HTTP | OCR text extraction |
| **Qdrant** | 6333 | HTTP/gRPC | Vector storage & search |
| **Supabase** | Cloud | HTTPS | Database, auth, storage |
| **OpenAI** | Cloud | HTTPS | Embeddings & chat completion |

---

## Communication Patterns

### 1. Frontend → API

**Protocol**: HTTP/REST
**Authentication**: JWT (Bearer token)
**Format**: JSON

#### Example: Document Upload Request

```typescript
// Frontend
const session = await supabase.auth.getSession();
const token = session.data.session?.access_token;

const response = await fetch(`${API_URL}/v1/documents/process`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    project_id: projectId,
    document_id: documentId,
    storage_path: storagePath
  })
});

if (!response.ok) {
  const error = await response.json();
  throw new Error(error.message || "Processing failed");
}

const result = await response.json();
console.log("Processing complete:", result);
```

#### API Endpoint Handler

```typescript
// API (Deno + Hono)
import { Context } from "hono";

export async function processDocument(c: Context) {
  const userId = c.get("userId");  // From auth middleware
  const { project_id, document_id, storage_path } = await c.req.json();

  // Validate input
  if (!project_id || !document_id || !storage_path) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  // Orchestrate processing
  try {
    const result = await documentProcessor.process({
      userId,
      projectId: project_id,
      documentId: document_id,
      storagePath: storage_path
    });

    return c.json({ data: result }, 200);
  } catch (error) {
    console.error("Processing failed:", error);
    return c.json({ error: error.message }, 500);
  }
}
```

### 2. API → Parser

**Protocol**: HTTP/REST
**Authentication**: None (internal network)
**Format**: JSON

#### Example: PDF Parsing Request

```typescript
// API calls Parser
const parserUrl = Deno.env.get("DOC_PARSER_URL") || "http://localhost:8080";

const response = await fetch(`${parserUrl}/parse/pdf`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    filePath: tempFilePath  // Shared volume path
  })
});

if (!response.ok) {
  throw new Error(`Parser failed: ${response.statusText}`);
}

const { pages } = await response.json();
// pages: [{ number: 1, text: "..." }, { number: 2, text: "..." }]
```

#### Parser Endpoint (Go)

```go
// Parser service (Go + Gin)
func ParsePDF(c *gin.Context) {
  var req struct {
    FilePath string `json:"filePath" binding:"required"`
  }

  if err := c.ShouldBindJSON(&req); err != nil {
    c.JSON(400, gin.H{"error": "invalid request"})
    return
  }

  // Set timeout
  ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
  defer cancel()

  // Process PDF
  pages, err := processPDF(ctx, req.FilePath)
  if err != nil {
    c.JSON(500, gin.H{"error": err.Error()})
    return
  }

  c.JSON(200, gin.H{
    "pages": pages,
    "meta": gin.H{"fileName": filepath.Base(req.FilePath)}
  })
}
```

### 3. API → Qdrant

**Protocol**: HTTP (via JS client library)
**Authentication**: API key (optional)
**Format**: JSON

#### Example: Vector Search

```typescript
import { QdrantClient } from "qdrant-js";

const qdrantClient = new QdrantClient({
  url: Deno.env.get("QDRANT_URL") || "http://localhost:6333",
  apiKey: Deno.env.get("QDRANT_API_KEY")  // Optional
});

// Search vectors
const results = await qdrantClient.search(collectionName, {
  vector: queryEmbedding,  // 1536-dimensional array
  limit: 10,
  score_threshold: 0.7,
  filter: {
    must: [
      { key: "projectId", match: { value: projectId } }
    ]
  }
});

// Results: [{ id, score, payload, vector? }, ...]
```

### 4. API → Supabase

**Protocol**: HTTPS (via JS client library)
**Authentication**: Service Role Key
**Format**: JSON

#### Example: Database Query

```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Query documents
const { data, error } = await supabase
  .from("project_files")
  .select("*")
  .eq("user_id", userId)
  .eq("project_id", projectId)
  .order("created_at", { ascending: false });

if (error) throw new Error(`Database query failed: ${error.message}`);
```

### 5. API → OpenAI

**Protocol**: HTTPS (via JS client library)
**Authentication**: API key
**Format**: JSON

#### Example: Generate Embeddings

```typescript
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY")
});

// Batch embedding generation
const response = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: chunks,  // Array of strings (up to 2048)
  encoding_format: "float"
});

const embeddings = response.data.map(item => item.embedding);
// embeddings: Array<number[]>  (1536 dimensions each)
```

---

## Error Handling

### Error Categories

| Category | Examples | Handling Strategy |
|----------|----------|-------------------|
| **Client Errors (4xx)** | Invalid input, unauthorized | Return error immediately |
| **Server Errors (5xx)** | Database down, timeout | Retry with backoff |
| **Network Errors** | Connection refused, DNS failure | Retry with backoff |
| **Timeout Errors** | Operation exceeds deadline | Cancel and return error |

### Error Response Format

```typescript
interface ErrorResponse {
  error: string;           // Human-readable message
  code?: string;          // Machine-readable error code
  details?: any;          // Additional context
  timestamp: string;      // ISO 8601 timestamp
}

// Example
{
  "error": "Document processing failed",
  "code": "PROCESSING_ERROR",
  "details": {
    "documentId": "doc-123",
    "reason": "OCR extraction timeout"
  },
  "timestamp": "2024-11-29T10:30:00Z"
}
```

### Error Propagation

```typescript
// Layer 1: Infrastructure (lowest)
try {
  const result = await qdrantClient.search(...);
} catch (error) {
  throw new QdrantError(`Vector search failed: ${error.message}`, error);
}

// Layer 2: Service (middle)
try {
  const results = await searchService.search(query, options);
} catch (error) {
  if (error instanceof QdrantError) {
    throw new SearchError(`Search operation failed: ${error.message}`, error);
  }
  throw error;
}

// Layer 3: API (highest)
try {
  const results = await searchService.search(query, options);
  return c.json({ results }, 200);
} catch (error) {
  console.error("Search request failed:", error);

  if (error instanceof SearchError) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ error: "Internal server error" }, 500);
}
```

### Graceful Degradation

```typescript
async function searchWithFallback(query: string, projectId: string) {
  try {
    // Try semantic search (Qdrant)
    return await semanticSearch(query, projectId);
  } catch (error) {
    console.error("Semantic search failed, falling back to keyword search:", error);

    // Fallback to keyword search (PostgreSQL)
    return await keywordSearch(query, projectId);
  }
}
```

---

## Retry Strategies

### Exponential Backoff

```typescript
async function callWithRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,     // 1 second
    maxDelay = 10000      // 10 seconds
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      // Don't retry on client errors (4xx)
      if (error instanceof HTTPError && error.status >= 400 && error.status < 500) {
        throw error;
      }

      // Last attempt, throw error
      if (attempt === maxAttempts) {
        throw new Error(`Operation failed after ${maxAttempts} attempts: ${error.message}`);
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt - 1),  // 1s, 2s, 4s, 8s...
        maxDelay
      );

      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error("Unreachable");
}

// Usage
const result = await callWithRetry(
  () => fetch(parserUrl).then(r => r.json()),
  { maxAttempts: 3, baseDelay: 1000 }
);
```

### Retry with Jitter

```typescript
function calculateDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  // Exponential backoff
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);

  // Add jitter (±25% randomness)
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);

  return Math.min(exponentialDelay + jitter, maxDelay);
}
```

### Conditional Retry

```typescript
function shouldRetry(error: any): boolean {
  // Retry on network errors
  if (error instanceof TypeError && error.message.includes("fetch failed")) {
    return true;
  }

  // Retry on 5xx server errors
  if (error instanceof HTTPError && error.status >= 500) {
    return true;
  }

  // Retry on rate limit (429)
  if (error instanceof HTTPError && error.status === 429) {
    return true;
  }

  // Retry on specific OpenAI errors
  if (error.type === "rate_limit_error" || error.type === "server_error") {
    return true;
  }

  // Don't retry
  return false;
}
```

---

## Circuit Breakers

### Circuit Breaker Pattern

Prevents cascading failures by stopping requests to failing services.

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime?: number;
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";

  constructor(
    private threshold: number = 5,       // Open after 5 failures
    private timeout: number = 60000,     // Try again after 1 minute
    private successThreshold: number = 2 // Close after 2 successes
  ) {}

  async call<T>(operation: () => Promise<T>): Promise<T> {
    // Circuit is OPEN - reject immediately
    if (this.isOpen()) {
      throw new Error("Circuit breaker is OPEN - service unavailable");
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private isOpen(): boolean {
    if (this.state === "CLOSED") {
      return false;
    }

    if (this.state === "OPEN") {
      // Check if timeout has elapsed
      if (this.lastFailureTime && Date.now() - this.lastFailureTime >= this.timeout) {
        console.log("Circuit breaker: OPEN → HALF_OPEN (timeout elapsed)");
        this.state = "HALF_OPEN";
        return false;
      }
      return true;
    }

    // HALF_OPEN state
    return false;
  }

  private onSuccess() {
    if (this.state === "HALF_OPEN") {
      this.failures--;
      if (this.failures <= 0) {
        console.log("Circuit breaker: HALF_OPEN → CLOSED (recovery complete)");
        this.state = "CLOSED";
        this.failures = 0;
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === "CLOSED" && this.failures >= this.threshold) {
      console.error(`Circuit breaker: CLOSED → OPEN (${this.failures} failures)`);
      this.state = "OPEN";
    }

    if (this.state === "HALF_OPEN") {
      console.error("Circuit breaker: HALF_OPEN → OPEN (failure during recovery)");
      this.state = "OPEN";
    }
  }
}

// Usage
const parserCircuitBreaker = new CircuitBreaker(5, 60000);

async function callParser(filePath: string) {
  return parserCircuitBreaker.call(async () => {
    const response = await fetch(`${parserUrl}/parse/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath })
    });

    if (!response.ok) {
      throw new Error(`Parser failed: ${response.statusText}`);
    }

    return response.json();
  });
}
```

---

## Health Checks

### Service Health Check Endpoints

#### API Health Check

```typescript
// GET /health
export function healthCheck(c: Context) {
  return c.json({
    status: "healthy",
    service: "api",
    timestamp: new Date().toISOString(),
    dependencies: {
      qdrant: await checkQdrant(),
      supabase: await checkSupabase(),
      parser: await checkParser()
    }
  });
}

async function checkQdrant(): Promise<{ status: string }> {
  try {
    await qdrantClient.getCollections();
    return { status: "healthy" };
  } catch (error) {
    return { status: "unhealthy", error: error.message };
  }
}
```

#### Parser Health Check (Go)

```go
func HealthCheck(c *gin.Context) {
  c.JSON(200, gin.H{
    "status": "healthy",
    "service": "parser",
    "timestamp": time.Now().Format(time.RFC3339),
  })
}
```

### Docker Compose Health Checks

```yaml
services:
  qdrant:
    image: qdrant/qdrant:latest
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  doc-parser:
    build: ./doc-parser
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    depends_on:
      qdrant:
        condition: service_healthy

  api:
    image: denoland/deno:2.5.2
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    depends_on:
      doc-parser:
        condition: service_healthy
      qdrant:
        condition: service_healthy
```

---

## Timeouts & Cancellation

### Context-Based Timeouts (Go Parser)

```go
func ParsePDF(c *gin.Context) {
  // Create context with 30-second timeout
  ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
  defer cancel()

  var req ParseRequest
  if err := c.ShouldBindJSON(&req); err != nil {
    c.JSON(400, gin.H{"error": "invalid request"})
    return
  }

  pages, err := extractTextFromPDF(ctx, req.FilePath)
  if err != nil {
    // Check if timeout occurred
    if errors.Is(err, context.DeadlineExceeded) {
      c.JSON(http.StatusRequestTimeout, gin.H{
        "error": "processing timeout after 30 seconds"
      })
      return
    }

    c.JSON(500, gin.H{"error": err.Error()})
    return
  }

  c.JSON(200, gin.H{"pages": pages})
}
```

### Fetch Timeouts (Deno API)

```typescript
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    return response;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Usage
const response = await fetchWithTimeout(
  `${parserUrl}/parse/pdf`,
  { method: "POST", body: JSON.stringify({ filePath }) },
  30000  // 30 seconds
);
```

---

## Distributed Tracing

### Trace ID Propagation

```typescript
// Generate trace ID at API entry point
export async function tracingMiddleware(c: Context, next: Next) {
  const traceId = c.req.header("X-Trace-ID") || crypto.randomUUID();
  c.set("traceId", traceId);
  c.res.headers.set("X-Trace-ID", traceId);

  console.log(`[${traceId}] ${c.req.method} ${c.req.url}`);

  await next();
}

// Propagate to downstream services
async function callParser(filePath: string, traceId: string) {
  const response = await fetch(`${parserUrl}/parse/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Trace-ID": traceId  // Propagate trace ID
    },
    body: JSON.stringify({ filePath })
  });

  return response.json();
}

// Log with trace ID
function log(traceId: string, message: string, data?: any) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    traceId,
    message,
    data
  }));
}
```

### Structured Logging

```typescript
interface LogEntry {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR";
  service: string;
  traceId?: string;
  event: string;
  data?: any;
}

function logStructured(entry: Omit<LogEntry, "timestamp">) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry
  }));
}

// Usage
logStructured({
  level: "INFO",
  service: "api",
  traceId: traceId,
  event: "document_processing_started",
  data: { documentId, userId, projectId }
});
```

---

## Docker Compose Configuration

### Development Setup

```yaml
services:
  # Vector Database
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Document Parser
  doc-parser:
    build:
      context: ../doc-parser
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    environment:
      - PORT=8080
    volumes:
      - shared_temp:/tmp  # Shared temp directory
    depends_on:
      qdrant:
        condition: service_healthy

  # API Service
  api:
    image: denoland/deno:2.5.2
    ports:
      - "8000:8000"
    env_file:
      - .env
    environment:
      - PORT=8000
      - QDRANT_URL=http://qdrant:6333
      - DOC_PARSER_URL=http://doc-parser:8080
    working_dir: /app
    volumes:
      - ../api:/app
      - shared_temp:/tmp  # Shared temp directory
    command: >
      sh -c "deno run --allow-net --allow-env --allow-read --allow-write --watch main.ts"
    depends_on:
      doc-parser:
        condition: service_healthy

volumes:
  qdrant_data:
  shared_temp:  # Shared for file exchange

networks:
  default:
    driver: bridge
```

### Key Configuration Points

1. **Shared Volumes**: `/tmp` mounted in both API and Parser for file exchange
2. **Health Checks**: Ensure services start in correct order
3. **Service Dependencies**: API depends on Parser, Parser depends on Qdrant
4. **Environment Variables**: Centralized in `.env` file
5. **Network**: All services on same bridge network for inter-service communication

---

## Deployment Strategies

### Rolling Deployment

```
1. Deploy new API version
   ├─ Start new API containers
   ├─ Health check passes
   ├─ Route traffic to new containers
   └─ Stop old containers

2. Deploy new Parser version
   ├─ Start new Parser containers
   ├─ Health check passes
   ├─ API routes requests to new Parsers
   └─ Stop old containers

3. Deploy new Frontend
   ├─ Build static assets
   ├─ Upload to CDN
   └─ Update CDN routing
```

### Blue-Green Deployment

```
Production (Blue)                    Staging (Green)
     │                                    │
     ├─ API v1.0                         ├─ API v1.1
     ├─ Parser v1.0                      ├─ Parser v1.1
     └─ Frontend v1.0                    └─ Frontend v1.1

Test Green environment → Switch traffic → Blue becomes new Green
```

### Canary Deployment

```
API v1.0 (90% traffic)
API v1.1 (10% traffic)  ← Monitor metrics

If metrics good:
  API v1.0 (50% traffic)
  API v1.1 (50% traffic)

If metrics good:
  API v1.1 (100% traffic)
  API v1.0 (0% traffic) → Decommission
```

---

## 🚨 Troubleshooting Common Issues

### Issue 1: Service-to-Service Communication Failures

**Symptom**: API can't reach Go parser, timeout errors

**Cause**: Network connectivity, wrong service URL, or parser crashed

**Debugging Steps**:
```bash
# 1. Check all services are running
docker ps  # or docker compose ps

# 2. Test parser health directly
curl http://localhost:8080/health

# 3. Test from API container (if using Docker)
docker exec -it api-container curl http://doc-parser:8080/health

# 4. Check service logs
docker compose logs doc-parser
docker compose logs api
```

**Solutions**:
- **Wrong URL**: In Docker, use service name `http://doc-parser:8080` not `localhost:8080`
- **Network issue**: Check services are on same Docker network
- **Parser crashed**: Check logs, restart service
- **Firewall blocking**: Ensure ports exposed correctly

**Docker Compose Network Fix**:
```yaml
services:
  api:
    environment:
      PARSER_URL: http://doc-parser:8080  # ✅ Service name
      # NOT http://localhost:8080  # ❌ Won't work in container
    networks:
      - insightsphere

  doc-parser:
    networks:
      - insightsphere

networks:
  insightsphere:
    driver: bridge
```

---

### Issue 2: Inconsistent State Across Services

**Symptom**: Document shows "ready" in DB but vectors not in Qdrant

**Cause**: Partial failure in processing pipeline, transaction not rolled back

**Debugging Steps**:
```bash
# 1. Check document status
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/v1/documents/$DOC_ID

# 2. Check Qdrant has vectors
curl http://localhost:6333/collections/insightsphere_user_XXX_project_YYY

# 3. Compare counts
# Documents with status="ready" vs. Qdrant point count
```

**Solutions**:
- **Reprocess document**: Change status to "processing" and retry
- **Clean up orphaned records**: Delete document and Qdrant points
- **Add idempotency**: Use transaction IDs to prevent duplicates

**Recovery Script**:
```typescript
// Find inconsistent documents
const documents = await supabase
  .from("documents")
  .select("*")
  .eq("status", "ready");

for (const doc of documents.data) {
  const collectionName = `insightsphere_user_${doc.user_id}_project_${doc.project_id}`;

  // Check if vectors exist
  const points = await qdrantClient.scroll(collectionName, {
    filter: {
      must: [
        { key: "documentId", match: { value: doc.id } }
      ]
    },
    limit: 1
  });

  if (points.points.length === 0) {
    console.log(`Document ${doc.id} missing vectors, marking for reprocessing`);
    await supabase
      .from("documents")
      .update({ status: "processing" })
      .eq("id", doc.id);
  }
}
```

---

### Issue 3: Version Mismatch Between Services

**Symptom**: API expects field `pageNumber` but parser returns `page_num`

**Cause**: Services deployed at different versions, API contract changed

**Solutions**:
- **Rolling deployment**: Deploy services in correct order (parser → API → frontend)
- **Backward compatibility**: Support both old and new fields during transition
- **API versioning**: Use `/v1/`, `/v2/` endpoints

**Backward Compatible Handler**:
```typescript
// API code - handle both old and new parser responses
interface ParserResponse {
  pageNumber?: number;  // New field
  page_num?: number;    // Old field (deprecated)
}

function normalizeParserResponse(response: ParserResponse) {
  return {
    pageNumber: response.pageNumber ?? response.page_num ?? 0
  };
}
```

---

### Issue 4: Docker Compose Services Start in Wrong Order

**Symptom**: API fails to start because Qdrant not ready yet

**Cause**: No dependency management in docker-compose.yml

**Solution**:
```yaml
services:
  qdrant:
    image: qdrant/qdrant
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/health"]
      interval: 5s
      timeout: 3s
      retries: 5

  api:
    depends_on:
      qdrant:
        condition: service_healthy  # ✅ Wait for health check
      doc-parser:
        condition: service_started
    restart: on-failure  # ✅ Retry if fails

  doc-parser:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 5s
      timeout: 3s
      retries: 5
```

---

### Issue 5: Resource Contention Between Services

**Symptom**: All services slow, high CPU/memory usage

**Cause**: Multiple services competing for resources, no limits set

**Solution**:
```yaml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M

  doc-parser:
    deploy:
      resources:
        limits:
          cpus: '2.0'      # ✅ More CPU for OCR
          memory: 2G
        reservations:
          cpus: '1.0'
          memory: 1G

  qdrant:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 2G       # ✅ More memory for vectors
        reservations:
          cpus: '0.5'
          memory: 1G
```

**Monitor Resources**:
```bash
# Check container resource usage
docker stats

# Check system resources
htop  # or top

# View service logs for OOM errors
docker compose logs | grep -i "out of memory"
```

---

### Issue 6: Environment Variables Not Synced

**Symptom**: API has new `EMBEDDING_MODEL` var but parser doesn't

**Cause**: `.env` files not updated consistently across services

**Solutions**:
- **Centralized config**: Use shared `.env` file mounted to all services
- **Config validation**: Services check required vars on startup
- **Documentation**: Maintain env var checklist

**Docker Compose Shared Env**:
```yaml
services:
  api:
    env_file:
      - .env.shared      # ✅ Shared variables
      - .env.api         # ✅ Service-specific

  doc-parser:
    env_file:
      - .env.shared      # ✅ Shared variables
      - .env.parser      # ✅ Service-specific
```

**Startup Validation**:
```typescript
// api/main.ts
const requiredEnvVars = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "OPENAI_API_KEY",
  "QDRANT_URL",
  "PARSER_URL"
];

for (const varName of requiredEnvVars) {
  if (!Deno.env.get(varName)) {
    console.error(`❌ Missing required environment variable: ${varName}`);
    Deno.exit(1);
  }
}
console.log("✅ All required environment variables present");
```

---

## Related Documentation

- [Architecture](architecture.md) - System architecture overview
- [Design Principles](design-principles.md) - Coding standards
- [Go Patterns](go-patterns.md) - Go service patterns
- [Deno Conventions](deno-conventions.md) - Deno API patterns

---

**Last Updated**: 2025-11-29
**Maintained By**: InsightSphere Platform Team
