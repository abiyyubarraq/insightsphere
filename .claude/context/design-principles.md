# Design Principles & Coding Standards

**Comprehensive guide to InsightSphere's coding standards, best practices, and design philosophy across all technologies.**

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [TypeScript Standards](#typescript-standards)
3. [Svelte 5 Conventions](#svelte-5-conventions)
4. [Deno API Patterns](#deno-api-patterns)
5. [Go Service Conventions](#go-service-conventions)
6. [API Design](#api-design)
7. [Error Handling](#error-handling)
8. [Database Design](#database-design)
9. [RAG-Specific Guidelines](#rag-specific-guidelines)
10. [Security Practices](#security-practices)
11. [Performance Optimization](#performance-optimization)
12. [Documentation Standards](#documentation-standards)
13. [Git Workflow](#git-workflow)

---

## Core Principles

### 1. Simplicity Over Cleverness

**Bad**:
```typescript
const x = a?.b?.c ?? d || e && f ? g : h;
```

**Good**:
```typescript
const value = a?.b?.c;
if (value !== undefined && value !== null) {
  return value;
}
return d || (e && f ? g : h);
```

### 2. Explicit Over Implicit

**Bad**:
```typescript
// What does this return? When does it throw?
function process(data: any) {
  return data.map(x => x.value);
}
```

**Good**:
```typescript
/**
 * Extracts values from data objects.
 * @throws {TypeError} If data is not an array
 * @throws {Error} If any object lacks a 'value' property
 */
function extractValues(data: DataObject[]): string[] {
  if (!Array.isArray(data)) {
    throw new TypeError("Data must be an array");
  }

  return data.map(obj => {
    if (!obj.value) {
      throw new Error(`Object missing 'value' property: ${JSON.stringify(obj)}`);
    }
    return obj.value;
  });
}
```

### 3. Fail Fast

**Bad**:
```typescript
async function processDocument(docId?: string) {
  // ... 50 lines of processing
  if (!docId) {
    throw new Error("Document ID required");
  }
}
```

**Good**:
```typescript
async function processDocument(docId: string) {
  if (!docId) {
    throw new Error("Document ID required");
  }

  // ... processing logic
}
```

### 4. Type Safety First

**Bad**:
```typescript
function search(query: any, options?: any): any {
  // ...
}
```

**Good**:
```typescript
interface SearchOptions {
  limit?: number;
  threshold?: number;
  projectId: string;
}

interface SearchResult {
  text: string;
  score: number;
  metadata: ResultMetadata;
}

function search(query: string, options: SearchOptions): Promise<SearchResult[]> {
  // ...
}
```

### 5. Consistent Error Handling

Every layer should handle errors predictably:

```typescript
// API Layer: HTTP errors
try {
  const result = await service.process();
  return c.json({ data: result }, 200);
} catch (error) {
  console.error("Processing failed:", error);
  return c.json({ error: error.message }, 500);
}

// Service Layer: Domain errors
try {
  const data = await repository.fetch();
  return processData(data);
} catch (error) {
  throw new ProcessingError(`Failed to process: ${error.message}`, error);
}

// Repository Layer: Infrastructure errors
try {
  return await database.query(sql);
} catch (error) {
  throw new DatabaseError(`Query failed: ${error.message}`, error);
}
```

---

## TypeScript Standards

### Configuration

Use **strict mode** always:

```json
// tsconfig.json / deno.jsonc
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### Type Definitions

#### Use Interfaces for Objects

```typescript
// ✅ Good
interface User {
  id: string;
  email: string;
  createdAt: Date;
}

// ✅ Good (when you need union/intersection)
type Status = "pending" | "processing" | "completed" | "failed";
type UserWithStatus = User & { status: Status };

// ❌ Bad (prefer interface)
type User = {
  id: string;
  email: string;
};
```

#### Avoid `any`, Use `unknown`

```typescript
// ❌ Bad
function parseJSON(json: string): any {
  return JSON.parse(json);
}

// ✅ Good
function parseJSON<T = unknown>(json: string): T {
  return JSON.parse(json) as T;
}

// ✅ Better with validation
function parseJSON<T>(json: string, validator: (data: unknown) => data is T): T {
  const parsed = JSON.parse(json);
  if (!validator(parsed)) {
    throw new Error("Invalid JSON structure");
  }
  return parsed;
}
```

#### Type Guards

```typescript
interface Document {
  id: string;
  type: "pdf" | "docx";
}

interface PDFDocument extends Document {
  type: "pdf";
  pageCount: number;
}

// Type guard
function isPDFDocument(doc: Document): doc is PDFDocument {
  return doc.type === "pdf";
}

// Usage
if (isPDFDocument(document)) {
  console.log(document.pageCount);  // TypeScript knows this exists
}
```

### Async/Await

**Always** use async/await over raw promises:

```typescript
// ❌ Bad
function fetchData() {
  return fetch(url)
    .then(res => res.json())
    .then(data => processData(data))
    .catch(err => handleError(err));
}

// ✅ Good
async function fetchData() {
  try {
    const res = await fetch(url);
    const data = await res.json();
    return processData(data);
  } catch (error) {
    handleError(error);
    throw error;
  }
}
```

### Destructuring

Use destructuring for clarity:

```typescript
// ❌ Bad
function processUser(user: User) {
  console.log(user.id, user.email, user.name);
  sendEmail(user.email, user.name);
}

// ✅ Good
function processUser({ id, email, name }: User) {
  console.log(id, email, name);
  sendEmail(email, name);
}
```

### Optional Chaining & Nullish Coalescing

```typescript
// ✅ Good use of optional chaining
const userName = user?.profile?.name ?? "Anonymous";

// ✅ Good use of nullish coalescing
const limit = options.limit ?? 10;  // Only default if null/undefined

// ❌ Bad (|| includes falsy values like 0, "")
const limit = options.limit || 10;  // Wrong if limit is intentionally 0
```

---

## Svelte 5 Conventions

### Component Structure

```svelte
<script lang="ts">
  // 1. Imports (grouped by category)
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import Button from "$lib/components/ui/Button.svelte";
  import { apiClient } from "$lib/api/client";
  import type { User, Project } from "$lib/types";

  // 2. Props (using $props rune)
  let { user, onUpdate }: { user: User; onUpdate: (user: User) => void } = $props();

  // 3. State (using $state rune)
  let loading = $state(false);
  let projects = $state<Project[]>([]);
  let selectedProject = $state<Project | null>(null);

  // 4. Derived state (using $derived rune)
  let projectCount = $derived(projects.length);
  let hasProjects = $derived(projects.length > 0);

  // 5. Effects (using $effect rune)
  $effect(() => {
    console.log(`User ${user.id} has ${projectCount} projects`);
  });

  // 6. Functions
  async function loadProjects() {
    loading = true;
    try {
      projects = await apiClient.getProjects(user.id);
    } catch (error) {
      console.error("Failed to load projects:", error);
    } finally {
      loading = false;
    }
  }

  // 7. Lifecycle
  onMount(() => {
    loadProjects();
  });
</script>

<!-- 8. Template -->
<div class="container">
  {#if loading}
    <span class="loading loading-spinner"></span>
  {:else if hasProjects}
    <ul>
      {#each projects as project}
        <li>{project.name}</li>
      {/each}
    </ul>
  {:else}
    <p>No projects found</p>
  {/if}
</div>

<!-- 9. Styles (scoped to component) -->
<style>
  .container {
    padding: 1rem;
  }
</style>
```

### Runes Usage Patterns

#### `$state` - Reactive State

```typescript
// ✅ Good - primitive values
let count = $state(0);
let name = $state("");

// ✅ Good - objects (entire object is reactive)
let user = $state({ id: 1, name: "Alice" });

// ✅ Good - arrays
let items = $state<string[]>([]);

// ❌ Bad - don't destructure $state objects
let { name } = $state({ name: "Alice" });  // name is NOT reactive

// ✅ Good - access properties directly
let user = $state({ name: "Alice" });
console.log(user.name);  // Reactive
```

#### `$derived` - Computed Values

```typescript
// ✅ Good - simple derivation
let count = $state(0);
let doubled = $derived(count * 2);

// ✅ Good - complex derivation
let items = $state<Item[]>([]);
let searchQuery = $state("");
let filteredItems = $derived(
  items.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  )
);

// ❌ Bad - side effects in $derived
let total = $derived(() => {
  console.log("Calculating total");  // ❌ Side effect
  return items.reduce((sum, item) => sum + item.price, 0);
});

// ✅ Good - pure computation only
let total = $derived(items.reduce((sum, item) => sum + item.price, 0));
```

#### `$effect` - Side Effects

```typescript
// ✅ Good - DOM manipulation
let messages = $state<Message[]>([]);
let container: HTMLDivElement;

$effect(() => {
  if (messages.length > 0 && container) {
    container.scrollTop = container.scrollHeight;
  }
});

// ✅ Good - cleanup
$effect(() => {
  const interval = setInterval(() => {
    console.log("Tick");
  }, 1000);

  return () => clearInterval(interval);  // Cleanup function
});

// ❌ Bad - async effects (use async functions instead)
$effect(async () => {  // ❌ Don't do this
  const data = await fetchData();
});

// ✅ Good - call async function from effect
$effect(() => {
  loadData();
});

async function loadData() {
  const data = await fetchData();
  items = data;
}
```

#### `$props` - Component Props

```typescript
// ✅ Good - typed props
let { user, onUpdate }: {
  user: User;
  onUpdate: (user: User) => void;
} = $props();

// ✅ Good - optional props with defaults
let {
  limit = 10,
  threshold = 0.7
}: {
  limit?: number;
  threshold?: number;
} = $props();

// ✅ Good - rest props
let { class: className, ...rest } = $props<{
  class?: string;
  [key: string]: unknown;
}>();
```

### Event Handlers

```svelte
<script lang="ts">
  let count = $state(0);

  // ✅ Good - inline for simple logic
  <button onclick={() => count++}>Increment</button>

  // ✅ Good - function for complex logic
  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const formData = new FormData(event.target as HTMLFormElement);
    // ... process form
  }

  <form onsubmit={handleSubmit}>
    <!-- ... -->
  </form>
</script>
```

### Component Naming

- **PascalCase** for component files: `UserCard.svelte`, `ProjectList.svelte`
- **Descriptive names**: `DocumentUploadButton.svelte` > `Button.svelte`
- **Folder organization**:
  ```
  lib/components/
  ├── ui/              # Reusable UI primitives
  │   ├── Button.svelte
  │   └── Input.svelte
  ├── documents/       # Domain-specific components
  │   ├── DocumentCard.svelte
  │   └── DocumentList.svelte
  └── layout/          # Layout components
      ├── Header.svelte
      └── Sidebar.svelte
  ```

---

## Deno API Patterns

### File Organization

```
api/
├── main.ts                 # Entry point
├── lib/                    # Core services
│   ├── qdrantClient.ts
│   ├── openaiClient.ts
│   └── supabaseClient.ts
├── routes/                 # Route handlers (by feature)
│   ├── documents/
│   │   ├── process.ts
│   │   └── delete.ts
│   └── search/
│       └── query.ts
├── middleware/             # Shared middleware
│   ├── auth.ts
│   └── logger.ts
└── types/                  # Type definitions
    └── api.ts
```

### Hono Route Handlers

```typescript
// routes/documents/process.ts
import { Context } from "hono";
import type { AuthContext } from "../../middleware/auth";

export async function processDocument(c: Context<AuthContext>) {
  // 1. Extract data
  const userId = c.get("userId");  // From auth middleware
  const { project_id, document_id, storage_path } = await c.req.json();

  // 2. Validate input
  if (!project_id || !document_id || !storage_path) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  // 3. Authorize
  const hasAccess = await verifyProjectAccess(userId, project_id);
  if (!hasAccess) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // 4. Process
  try {
    const result = await documentService.process({
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

### Deno Imports

Use **npm:** specifier for npm packages:

```typescript
// ✅ Good - explicit npm imports
import { Hono } from "npm:hono@^4.0.0";
import OpenAI from "npm:openai@^4.0.0";

// ❌ Bad - don't use node: specifier in Deno
import fs from "node:fs";  // Won't work in Deno

// ✅ Good - use Deno APIs
import { readFile } from "https://deno.land/std/fs/mod.ts";
```

### Environment Variables

```typescript
// ✅ Good - validate env vars on startup
const requiredEnvVars = [
  "OPENAI_API_KEY",
  "QDRANT_URL",
  "SUPABASE_URL"
] as const;

for (const envVar of requiredEnvVars) {
  if (!Deno.env.get(envVar)) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// ✅ Good - type-safe access
function getEnv(key: string): string {
  const value = Deno.env.get(key);
  if (!value) {
    throw new Error(`Environment variable ${key} not set`);
  }
  return value;
}

const openaiKey = getEnv("OPENAI_API_KEY");
```

### Error Classes

```typescript
// lib/errors.ts
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = "APIError";
  }
}

export class AuthenticationError extends APIError {
  constructor(message = "Unauthorized") {
    super(message, 401, "AUTH_FAILED");
  }
}

export class ValidationError extends APIError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

// Usage
throw new ValidationError("Document ID is required");
```

---

## Go Service Conventions

### Project Structure

```
doc-parser/
├── main.go              # Entry point
├── handlers/            # HTTP handlers
│   └── parser.go
├── services/            # Business logic
│   ├── pdf.go
│   └── ocr.go
├── models/              # Data structures
│   └── document.go
└── utils/               # Utilities
    └── file.go
```

### Error Handling

```go
// ✅ Good - always check errors
result, err := processDocument(ctx, filePath)
if err != nil {
  return nil, fmt.Errorf("failed to process document: %w", err)
}

// ✅ Good - wrap errors with context
if err := saveFile(path, data); err != nil {
  return fmt.Errorf("save file %s: %w", path, err)
}

// ❌ Bad - never ignore errors
result, _ := processDocument(ctx, filePath)  // ❌ Silent failure
```

### Context Usage

```go
// ✅ Good - pass context as first parameter
func processDocument(ctx context.Context, filePath string) ([]Page, error) {
  // Check for cancellation
  select {
  case <-ctx.Done():
    return nil, ctx.Err()
  default:
  }

  // Use context in operations
  pages, err := extractPages(ctx, filePath)
  if err != nil {
    return nil, err
  }

  return pages, nil
}

// ✅ Good - timeout context
ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
defer cancel()

result, err := processDocument(ctx, filePath)
if err != nil {
  if errors.Is(err, context.DeadlineExceeded) {
    c.JSON(http.StatusRequestTimeout, gin.H{"error": "processing timeout"})
    return
  }
  c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
  return
}
```

### Goroutines & Concurrency

```go
// ✅ Good - use WaitGroup for coordination
var wg sync.WaitGroup
results := make([]Result, len(items))
errors := make(chan error, len(items))

for i, item := range items {
  wg.Add(1)
  go func(index int, it Item) {
    defer wg.Done()

    result, err := process(it)
    if err != nil {
      errors <- fmt.Errorf("item %d: %w", index, err)
      return
    }

    results[index] = result
  }(i, item)  // ✅ Pass loop variables to avoid closure issues
}

wg.Wait()
close(errors)

// Check for errors
if len(errors) > 0 {
  return nil, <-errors
}

return results, nil
```

### Struct Definitions

```go
// ✅ Good - use tags for JSON serialization
type Document struct {
  ID        string    `json:"id"`
  FileName  string    `json:"fileName"`
  FileType  string    `json:"fileType"`
  Pages     []Page    `json:"pages"`
  CreatedAt time.Time `json:"createdAt"`
}

type Page struct {
  Number int    `json:"number"`
  Text   string `json:"text"`
}
```

### Gin Handlers

```go
func ParsePDF(c *gin.Context) {
  // 1. Bind JSON request
  var req ParseRequest
  if err := c.ShouldBindJSON(&req); err != nil {
    c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
    return
  }

  // 2. Validate
  if req.FilePath == "" {
    c.JSON(http.StatusBadRequest, gin.H{"error": "filePath required"})
    return
  }

  // 3. Process with timeout
  ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
  defer cancel()

  pages, err := processPDF(ctx, req.FilePath)
  if err != nil {
    log.Printf("PDF processing failed: %v", err)
    c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
    return
  }

  // 4. Return success
  c.JSON(http.StatusOK, gin.H{
    "pages": pages,
    "meta": gin.H{"fileName": filepath.Base(req.FilePath)},
  })
}
```

---

## API Design

### RESTful Conventions

```
GET    /v1/projects           # List projects
POST   /v1/projects           # Create project
GET    /v1/projects/:id       # Get project
PUT    /v1/projects/:id       # Update project
DELETE /v1/projects/:id       # Delete project

GET    /v1/projects/:id/documents         # List documents in project
POST   /v1/projects/:id/documents         # Upload document
DELETE /v1/documents/:id                  # Delete document

POST   /v1/documents/:id/process          # Trigger processing
GET    /v1/documents/:id/status           # Check processing status

POST   /v1/search/query                   # Search documents
POST   /v1/chat/completion                # AI chat
```

### Request/Response Format

#### Request Body

```json
{
  "query": "What are the key findings?",
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "options": {
    "limit": 10,
    "threshold": 0.7
  }
}
```

#### Success Response

```json
{
  "data": {
    "results": [
      {
        "text": "The key findings include...",
        "score": 0.89,
        "metadata": {
          "documentId": "...",
          "fileName": "report.pdf"
        }
      }
    ]
  },
  "meta": {
    "processingTime": "0.8s",
    "timestamp": "2024-11-29T10:30:00Z"
  }
}
```

#### Error Response

```json
{
  "error": {
    "message": "Document not found",
    "code": "DOCUMENT_NOT_FOUND",
    "statusCode": 404
  }
}
```

### Versioning

- **Use URL versioning**: `/v1/`, `/v2/`
- **Never break backward compatibility** within a version
- **Deprecate gracefully**: Announce deprecations 6+ months in advance

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | When to Use |
|------|---------|-------------|
| **200** | OK | Successful GET, PUT, PATCH |
| **201** | Created | Successful POST (resource created) |
| **202** | Accepted | Async operation started |
| **204** | No Content | Successful DELETE |
| **400** | Bad Request | Invalid input, validation failure |
| **401** | Unauthorized | Missing or invalid JWT |
| **403** | Forbidden | Valid JWT but no access to resource |
| **404** | Not Found | Resource doesn't exist |
| **409** | Conflict | Duplicate resource (e.g., email exists) |
| **422** | Unprocessable Entity | Semantic validation failure |
| **500** | Internal Server Error | Unexpected server error |
| **503** | Service Unavailable | Dependency (Qdrant, OpenAI) down |

### Error Logging

```typescript
// ✅ Good - structured logging
console.error("Document processing failed", {
  documentId,
  userId,
  projectId,
  error: error.message,
  stack: error.stack,
  timestamp: new Date().toISOString()
});

// ❌ Bad - unstructured
console.error("Error:", error);
```

### User-Facing Errors

```typescript
// ❌ Bad - expose internal details
return c.json({ error: "Database query failed: SELECT * FROM..." }, 500);

// ✅ Good - generic message with tracking ID
const errorId = crypto.randomUUID();
console.error(`[${errorId}] Database error:`, error);
return c.json({
  error: "An internal error occurred",
  errorId,
  message: "Please contact support with this error ID"
}, 500);
```

---

## Database Design

### Naming Conventions

- **Tables**: `snake_case`, plural: `users`, `projects`, `documents`
- **Columns**: `snake_case`: `user_id`, `created_at`, `file_name`
- **Indexes**: `idx_{table}_{column}`: `idx_documents_user_id`
- **Foreign Keys**: `fk_{table}_{referenced_table}`: `fk_documents_projects`

### Schema Best Practices

```sql
-- ✅ Good table design
CREATE TABLE documents (
  -- Primary key (UUID)
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys with ON DELETE
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) NOT NULL,

  -- Required fields
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,

  -- Optional fields
  page_count INTEGER,
  processing_error TEXT,

  -- Enum-like field
  processing_status TEXT DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_documents_project_id ON documents(project_id);
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_status ON documents(processing_status);

-- RLS policies
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents"
  ON documents FOR SELECT
  USING (auth.uid() = user_id);
```

---

## RAG-Specific Guidelines

### Embedding Consistency (CRITICAL)

```typescript
// ✅ CORRECT - same model for documents and queries
const EMBEDDING_MODEL = "text-embedding-3-small";

// Document processing
const docEmbeddings = await openai.embeddings.create({
  model: EMBEDDING_MODEL,
  input: chunks
});

// Query processing
const queryEmbedding = await openai.embeddings.create({
  model: EMBEDDING_MODEL,
  input: query
});

// ❌ WRONG - different models = incompatible vectors
const docEmbeddings = await openai.embeddings.create({
  model: "text-embedding-3-small",  // 1536 dims
  input: chunks
});

const queryEmbedding = await openai.embeddings.create({
  model: "text-embedding-3-large",  // 3072 dims - MISMATCH!
  input: query
});
```

### Chunking Strategy

```typescript
// ✅ Good - preserve sentence boundaries
function chunkText(text: string, maxTokens = 800, overlap = 100): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);

    if (currentTokens + sentenceTokens > maxTokens && currentChunk.length > 0) {
      chunks.push(currentChunk.join(" "));

      // Overlap: keep last few sentences
      const overlapSentences = currentChunk.slice(-2);  // Last 2 sentences
      currentChunk = overlapSentences;
      currentTokens = overlapSentences.reduce((sum, s) => sum + estimateTokens(s), 0);
    }

    currentChunk.push(sentence);
    currentTokens += sentenceTokens;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  return chunks;
}

// ❌ Bad - arbitrary character splits
function badChunkText(text: string, maxChars = 3000): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    chunks.push(text.slice(i, i + maxChars));  // Cuts mid-sentence!
  }
  return chunks;
}
```

### Search Context Building

```typescript
// ✅ Good - build context with citations
function buildContextForLLM(searchResults: SearchResult[]): string {
  return searchResults
    .map((result, index) => {
      return `[Source ${index + 1}: ${result.fileName}, Page ${result.pageNumber}]\n${result.text}\n`;
    })
    .join("\n---\n\n");
}

// Example output:
// [Source 1: Q3-Report.pdf, Page 3]
// The quarterly revenue increased by 23%...
//
// ---
//
// [Source 2: Budget-2024.pdf, Page 1]
// The total budget allocation for Q4...
```

---

## Security Practices

### Input Validation

```typescript
// ✅ Good - validate all inputs
import { z } from "zod";

const ProcessDocumentSchema = z.object({
  project_id: z.string().uuid(),
  document_id: z.string().uuid(),
  storage_path: z.string().min(1).max(500)
});

export async function processDocument(c: Context) {
  const body = await c.req.json();

  // Validate
  const result = ProcessDocumentSchema.safeParse(body);
  if (!result.success) {
    return c.json({ error: result.error.issues }, 400);
  }

  const { project_id, document_id, storage_path } = result.data;
  // ... proceed with validated data
}
```

### SQL Injection Prevention

```typescript
// ✅ Good - use parameterized queries (Supabase handles this)
const { data } = await supabase
  .from("documents")
  .select("*")
  .eq("user_id", userId)  // Parameterized
  .eq("project_id", projectId);

// ❌ Bad - string concatenation (Supabase doesn't expose raw SQL, but avoid if you do)
const query = `SELECT * FROM documents WHERE user_id = '${userId}'`;  // ❌ NEVER
```

### XSS Prevention

```svelte
<!-- ✅ Good - Svelte auto-escapes by default -->
<p>{userInput}</p>

<!-- ❌ Bad - unescaped HTML -->
<p>{@html userInput}</p>  <!-- ❌ Only use with sanitized input -->

<!-- ✅ Good - sanitize if you must use @html -->
<script>
  import DOMPurify from "dompurify";
  const sanitized = DOMPurify.sanitize(userInput);
</script>
<p>{@html sanitized}</p>
```

---

## Performance Optimization

### Database Queries

```typescript
// ❌ Bad - N+1 query problem
const documents = await getDocuments();
for (const doc of documents) {
  doc.project = await getProject(doc.project_id);  // N queries!
}

// ✅ Good - join or batch fetch
const { data: documents } = await supabase
  .from("documents")
  .select(`
    *,
    projects (
      id,
      name
    )
  `);
```

### Batch Operations

```typescript
// ❌ Bad - sequential embeddings
for (const chunk of chunks) {
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: chunk
  });
  embeddings.push(embedding);
}

// ✅ Good - batch embeddings
const response = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: chunks  // Up to 2048 inputs per request
});
const embeddings = response.data.map(e => e.embedding);
```

### Qdrant Operations

```typescript
// ❌ Bad - individual point insertions
for (const point of points) {
  await qdrant.upsert(collectionName, { points: [point] });
}

// ✅ Good - batch upsert (up to 100 points)
await qdrant.upsert(collectionName, { points });
```

---

## Documentation Standards

### Code Comments

```typescript
// ❌ Bad - obvious comments
let i = 0;  // Initialize i to 0

// ✅ Good - explain WHY, not WHAT
// Use exponential backoff to avoid overwhelming OpenAI API during rate limit errors
const delay = Math.pow(2, attempt) * 1000;

// ✅ Good - document complex algorithms
/**
 * Chunks text using sentence-boundary-aware algorithm.
 *
 * Algorithm:
 * 1. Split text into sentences
 * 2. Accumulate sentences until maxTokens reached
 * 3. Include overlap (last N sentences) for context continuity
 *
 * @param text - Input text to chunk
 * @param maxTokens - Maximum tokens per chunk (default: 800)
 * @param overlap - Overlap tokens between chunks (default: 100)
 * @returns Array of text chunks with preserved sentence boundaries
 */
function chunkText(text: string, maxTokens = 800, overlap = 100): string[] {
  // ...
}
```

### Function Documentation

Use JSDoc for all exported functions:

```typescript
/**
 * Processes a document through the RAG pipeline.
 *
 * Steps:
 * 1. Download file from Supabase Storage
 * 2. Extract text via OCR (Parser service)
 * 3. Chunk text with overlap
 * 4. Generate embeddings (OpenAI)
 * 5. Store in Qdrant
 *
 * @param params - Processing parameters
 * @param params.userId - Owner user ID
 * @param params.projectId - Project ID for collection isolation
 * @param params.documentId - Document ID
 * @param params.storagePath - Supabase Storage path
 * @returns Processing result with chunk/page counts
 * @throws {ProcessingError} If any step fails
 *
 * @example
 * ```typescript
 * const result = await processDocument({
 *   userId: "user-123",
 *   projectId: "proj-456",
 *   documentId: "doc-789",
 *   storagePath: "user-123/proj-456/doc-789/report.pdf"
 * });
 * console.log(`Processed ${result.chunks} chunks`);
 * ```
 */
export async function processDocument(params: ProcessParams): Promise<ProcessResult> {
  // ...
}
```

---

## Git Workflow

### Commit Messages

**Format**: `type(scope): subject`

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, no logic change)
- `refactor`: Code refactoring (no feature/bug change)
- `perf`: Performance improvement
- `test`: Add/update tests
- `chore`: Build, dependencies, tooling

**Examples**:
```
feat(api): add document summarization endpoint
fix(frontend): correct infinite scroll pagination bug
docs(rag): update embedding strategy documentation
refactor(parser): simplify OCR error handling
perf(qdrant): batch point insertions for 10x speedup
```

### Branch Naming

```
feature/document-summarization
fix/infinite-scroll-bug
refactor/simplify-ocr-pipeline
docs/update-architecture-guide
```

### Pull Request Template

```markdown
## Summary
Brief description of changes.

## Changes
- Added X
- Modified Y
- Fixed Z

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manually tested in dev environment

## Related Issues
Closes #123
```

---

## Related Documentation

- [Architecture](architecture.md) - System design and service organization
- [RAG Pipeline](rag-pipeline.md) - RAG implementation details
- [Embedding Strategy](embedding-strategy.md) - Embedding consistency rules
- [Svelte 5 Patterns](svelte5-patterns.md) - Advanced Svelte patterns
- [Deno Conventions](deno-conventions.md) - Deno-specific patterns
- [Go Patterns](go-patterns.md) - Go service patterns

---

**Last Updated**: 2025-11-29
**Maintained By**: InsightSphere Engineering Team
