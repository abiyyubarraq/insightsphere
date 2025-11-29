# Embedding Strategy Guide

**Document Version**: 1.0
**Last Updated**: 2025-11-29
**Related Files**:
- [api/lib/openaiClient.ts](../api/lib/openaiClient.ts)
- [api/lib/embeddingClient.ts](../api/lib/embeddingClient.ts)
- [api/lib/constants.ts](../api/lib/constants.ts)
- [api/routes/documents/process.ts](../api/routes/documents/process.ts)

---

## 🎯 Critical Concept: Embedding Consistency

**The #1 Rule of RAG Systems**: Document embeddings and query embeddings MUST use the same model.

### Why This Matters

Different embedding models produce vectors in different dimensional spaces:

| Model | Dimensions | Space |
|-------|-----------|-------|
| OpenAI text-embedding-3-small | **1536** | Space A |
| HuggingFace Qwen3-Embedding-8B | **4096** | Space B |
| Sentence-transformers all-MiniLM-L6-v2 | **384** | Space C |

**These spaces are incompatible:**
- Vectors in Space A cannot be compared with vectors in Space B
- Cosine similarity between different spaces is meaningless
- **Result**: Zero search results, broken RAG pipeline

### Real-World Impact

```typescript
// ❌ WRONG - This will break search
// Documents processed with OpenAI (1536 dims)
const docEmbedding = await openaiClient.generateEmbedding(chunk);

// Query processed with HuggingFace (4096 dims)
const queryEmbedding = await embeddingClient.generateHuggingFaceEmbedding(query);

// Qdrant search: 1536 vs 4096 = DIMENSION MISMATCH ERROR
// OR: Search succeeds but returns zero results
```

```typescript
// ✅ CORRECT - Consistent model
// Documents processed with OpenAI
const docEmbedding = await openaiClient.generateEmbedding(chunk);

// Query ALSO processed with OpenAI
const queryEmbedding = await openaiClient.generateEmbedding(query);

// Qdrant search: 1536 vs 1536 = SUCCESS
```

---

## 📊 Current Implementation (Production)

### Primary Strategy: OpenAI Only

**From** [process.ts:202-232](../api/routes/documents/process.ts#L202-L232):

```typescript
const embeddingModel = "text-embedding-3-small";
const embeddings = await openaiClient.generateBatchEmbeddings(
  chunkTexts,
  "text-embedding-3-small"  // 1536 dimensions
);

// NO FALLBACK - fail fast if OpenAI fails
if (!embeddings) {
  throw new Error(
    `OpenAI embedding generation failed. Cannot fall back to different ` +
    `embedding models as this would create dimension mismatch with query embeddings.`
  );
}
```

### Why No Fallback?

**Design Decision**: Fail fast rather than create incompatible data

**Rationale**:
1. **Consistency guarantee**: All documents use same model
2. **Query simplicity**: Queries don't need to detect which model was used
3. **Debugging**: Dimension mismatches are caught immediately
4. **Data integrity**: No mixed-model collections

**Trade-off**:
- ❌ Less resilient (OpenAI outage = processing stops)
- ✅ More reliable (no silent failures in search)
- ✅ Simpler codebase (no fallback logic)
- ✅ Better user experience (consistent quality)

---

## 🔧 OpenAI text-embedding-3-small

### Model Specifications

| Property | Value |
|----------|-------|
| **Model ID** | `text-embedding-3-small` |
| **Dimensions** | 1536 |
| **Max Input** | 8,191 tokens |
| **Encoding** | cl100k_base (tiktoken) |
| **Output** | Float array |

### API Usage

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY")
});

// Single embedding
const response = await client.embeddings.create({
  model: "text-embedding-3-small",
  input: "The quick brown fox jumps over the lazy dog",
  encoding_format: "float"
});

const embedding = response.data[0].embedding;
// embedding: number[] (length 1536)
```

### Batch Processing

```typescript
// Process multiple texts in one API call
const texts = [
  "First chunk of text...",
  "Second chunk of text...",
  "Third chunk of text..."
];

const response = await client.embeddings.create({
  model: "text-embedding-3-small",
  input: texts,  // Array of strings
  encoding_format: "float"
});

const embeddings = response.data.map(item => item.embedding);
// embeddings: number[][] (each embedding is 1536 floats)
```

**Benefits of Batching**:
- **10x fewer API calls**: 100 texts in 1 call vs 100 calls
- **Lower latency**: Parallel processing on OpenAI's side
- **Better throughput**: No per-request overhead
- **Same cost**: Billed by tokens, not API calls

### Cost Analysis

**Pricing** (as of 2025):
- $0.020 per 1M tokens
- $0.00002 per 1K tokens

**Example Document**:
```
Document: 50 pages
Text: 500 words/page = 25,000 words total
Tokens: 25,000 words × 1.3 = 32,500 tokens
Chunks: 32,500 tokens ÷ 800 tokens/chunk = 41 chunks

Cost: 32,500 tokens × $0.00002 / 1K = $0.00065 per document
```

**Monthly Costs** (1000 documents/month):
```
1000 docs × $0.00065 = $0.65/month for embeddings
```

**Very affordable** - embedding costs are negligible compared to LLM costs.

### Rate Limits

**OpenAI API Limits** (standard tier):
- **Requests**: 3,000 requests/minute
- **Tokens**: 1,000,000 tokens/minute

**InsightSphere Usage** (typical):
- **Document processing**: ~100 chunks/doc = 1 batch call
- **Query processing**: 1 embedding/query

**Handling Rate Limits**:
```typescript
// Exponential backoff retry
async function generateWithRetry(text: string, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await openaiClient.generateEmbedding({ text });
    } catch (error) {
      if (attempt === maxAttempts) throw error;

      // Check if it's a rate limit error
      if (error.status === 429) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;  // Other errors
    }
  }
}
```

---

## 🛠️ Alternative Models (Development Only)

### HuggingFace Embeddings

**File**: [api/lib/embeddingClient.ts](../api/lib/embeddingClient.ts)

**Purpose**: Free alternative for development/testing

**Current Model**: `Qwen/Qwen3-Embedding-8B`
- Dimensions: **4096**
- Free API (with HuggingFace token)
- Slower than OpenAI

**Usage**:
```typescript
import { embeddingClient } from "./embeddingClient.ts";

const response = await embeddingClient.generateHuggingFaceEmbedding(text);
const embedding = response.embedding;  // number[] (length 4096)
```

**⚠️ WARNING**: Do NOT mix with OpenAI embeddings
- Different dimensions (4096 vs 1536)
- Different semantic spaces
- Will break search completely

**Use Cases**:
- ✅ Development without OpenAI API key
- ✅ Cost-free testing
- ✅ Experimentation with different models
- ❌ Production use (use OpenAI)
- ❌ Mixed with OpenAI embeddings

### Model Comparison

| Model | Provider | Dims | Cost | Speed | Quality |
|-------|----------|------|------|-------|---------|
| **text-embedding-3-small** | OpenAI | 1536 | $0.02/1M | Fast | Excellent |
| text-embedding-3-large | OpenAI | 3072 | $0.13/1M | Fast | Best |
| Qwen3-Embedding-8B | HuggingFace | 4096 | Free | Slow | Good |
| all-MiniLM-L6-v2 | HuggingFace | 384 | Free | Fast | Fair |

**Recommendation**: Use OpenAI text-embedding-3-small for production
- Best balance of quality, speed, and cost
- Industry standard
- Well-supported

---

## 🔍 Dimension Management

### Detecting Dimensions

```typescript
// Check embedding dimensions
const embedding = await generateEmbedding(text);
console.log(`Embedding dimensions: ${embedding.length}`);

// Check Qdrant collection dimensions
const collectionInfo = await qdrantService.getCollectionInfo(userId, projectId);
const collectionDims = collectionInfo.config?.params?.vectors?.size;
console.log(`Collection dimensions: ${collectionDims}`);
```

### Handling Dimension Mismatches

**Problem**: Collection has 4096 dimensions, but new embeddings are 1536 dimensions

**Solutions**:

#### Option 1: Recreate Collection (Recommended)
```typescript
// Detect mismatch
if (currentDimension !== embeddingDimension) {
  console.warn(`Dimension mismatch: ${currentDimension} vs ${embeddingDimension}`);

  // Delete old collection
  await qdrantClient.deleteCollection(collectionName);

  // Create new collection with correct dimensions
  await qdrantClient.createCollection(collectionName, {
    vectors: {
      size: embeddingDimension,
      distance: "Cosine"
    }
  });

  console.log(`Collection recreated with ${embeddingDimension} dimensions`);
}
```

**Trade-off**:
- ✅ Clean slate, correct dimensions
- ❌ Lose all existing data
- ⚠️ Require reprocessing all documents

#### Option 2: Fail Fast
```typescript
if (currentDimension !== embeddingDimension) {
  throw new Error(
    `Dimension mismatch: collection has ${currentDimension} dimensions, ` +
    `but embeddings are ${embeddingDimension} dimensions. ` +
    `Cannot store incompatible vectors.`
  );
}
```

**Trade-off**:
- ✅ Protect data integrity
- ✅ Force explicit decision
- ❌ Require manual intervention

#### Option 3: Migration (Advanced)
```typescript
// 1. Create new collection with new dimensions
const newCollectionName = `${collectionName}_v2`;
await qdrantClient.createCollection(newCollectionName, {
  vectors: { size: newDimension, distance: "Cosine" }
});

// 2. Reprocess all documents with new embeddings
for (const doc of allDocuments) {
  const chunks = await chunkDocument(doc);
  const newEmbeddings = await generateEmbeddings(chunks, newModel);
  await qdrantClient.upsertChunks(newEmbeddings, newCollectionName);
}

// 3. Atomic switch
await qdrantClient.deleteCollection(collectionName);
await qdrantClient.renameCollection(newCollectionName, collectionName);
```

**Trade-off**:
- ✅ Zero downtime
- ✅ Keep old data during migration
- ❌ Complex implementation
- ❌ Higher storage costs during migration

---

## ⚡ Performance Optimization

### Batch Size Tuning

```typescript
// OpenAI supports up to 100 texts per batch
const OPTIMAL_BATCH_SIZE = 100;

async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
  const batches: number[][][] = [];

  for (let i = 0; i < texts.length; i += OPTIMAL_BATCH_SIZE) {
    const batch = texts.slice(i, i + OPTIMAL_BATCH_SIZE);

    const response = await openaiClient.generateBatchEmbeddings(
      batch,
      "text-embedding-3-small"
    );

    batches.push(response.map(r => r.embedding));
  }

  return batches.flat();
}
```

**Performance Impact**:
- **1 text**: 1 API call
- **100 texts**: 1 API call (100x fewer calls)
- **1000 texts**: 10 API calls (100x fewer calls)

### Parallel Batch Processing

```typescript
// Process multiple batches in parallel
const BATCH_SIZE = 100;
const batches: string[][] = [];

for (let i = 0; i < allTexts.length; i += BATCH_SIZE) {
  batches.push(allTexts.slice(i, i + BATCH_SIZE));
}

// Process all batches concurrently
const results = await Promise.all(
  batches.map(batch =>
    openaiClient.generateBatchEmbeddings(batch, "text-embedding-3-small")
  )
);

const allEmbeddings = results.flat();
```

**Benefits**:
- **Faster**: Concurrent API calls
- **Efficient**: Maximize throughput
- **Scalable**: Handle large documents

**Caution**:
- Don't exceed rate limits (3000 req/min)
- Monitor API usage
- Add delays if needed

### Caching Query Embeddings

```typescript
// Cache common queries
const queryEmbeddingCache = new Map<string, number[]>();

async function getCachedQueryEmbedding(query: string): Promise<number[]> {
  // Check cache
  if (queryEmbeddingCache.has(query)) {
    console.log(`Cache hit for query: ${query.substring(0, 50)}...`);
    return queryEmbeddingCache.get(query)!;
  }

  // Generate and cache
  const embedding = await openaiClient.generateEmbedding({
    text: query,
    model: "text-embedding-3-small"
  });

  queryEmbeddingCache.set(query, embedding.embedding);
  return embedding.embedding;
}

// Clear cache periodically (prevent memory leak)
setInterval(() => {
  if (queryEmbeddingCache.size > 1000) {
    queryEmbeddingCache.clear();
    console.log("Query embedding cache cleared");
  }
}, 60 * 60 * 1000);  // Every hour
```

---

## 🧪 Testing Embedding Consistency

### Unit Test

```typescript
import { assertEquals } from "https://deno.land/std/testing/asserts.ts";

Deno.test("Document and query embeddings have same dimensions", async () => {
  // Generate document embedding
  const docEmbedding = await openaiClient.generateEmbedding({
    text: "This is a test document chunk",
    model: "text-embedding-3-small"
  });

  // Generate query embedding
  const queryEmbedding = await openaiClient.generateEmbedding({
    text: "test query",
    model: "text-embedding-3-small"
  });

  // Assert same dimensions
  assertEquals(docEmbedding.embedding.length, 1536);
  assertEquals(queryEmbedding.embedding.length, 1536);
  assertEquals(
    docEmbedding.embedding.length,
    queryEmbedding.embedding.length
  );
});
```

### Integration Test

```typescript
Deno.test("Full RAG pipeline maintains embedding consistency", async () => {
  // 1. Process document
  const processResponse = await fetch(`${API_URL}/v1/documents/process`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${testToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      project_id: testProjectId,
      document_id: testDocumentId,
      storage_path: testStoragePath
    })
  });

  assertEquals(processResponse.status, 200);

  // 2. Query document
  const searchResponse = await fetch(`${API_URL}/v1/search/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${testToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: "test query",
      project_id: testProjectId,
      limit: 5
    })
  });

  const searchResult = await searchResponse.json();

  // 3. Verify results returned (no dimension mismatch)
  assertEquals(searchResponse.status, 200);
  assertEquals(searchResult.success, true);
  assert(searchResult.results.length > 0, "Should return results");
});
```

---

## 🚨 Common Pitfalls

### Pitfall 1: Using Different Models

```typescript
// ❌ WRONG - Different models for docs and queries
async function processDocument(chunks: string[]) {
  return await openaiClient.generateBatchEmbeddings(chunks, "text-embedding-3-small");
}

async function searchQuery(query: string) {
  return await embeddingClient.generateHuggingFaceEmbedding(query);  // Different model!
}
```

**Fix**:
```typescript
// ✅ CORRECT - Same model everywhere
const EMBEDDING_MODEL = "text-embedding-3-small";

async function processDocument(chunks: string[]) {
  return await openaiClient.generateBatchEmbeddings(chunks, EMBEDDING_MODEL);
}

async function searchQuery(query: string) {
  return await openaiClient.generateEmbedding({ text: query, model: EMBEDDING_MODEL });
}
```

### Pitfall 2: Ignoring Dimension Mismatches

```typescript
// ❌ WRONG - Silent failure
await qdrantClient.upsert(collectionName, {
  points: chunks.map(chunk => ({
    id: chunk.id,
    vector: chunk.embedding,  // Might be wrong dimensions
    payload: chunk.metadata
  }))
});
```

**Fix**:
```typescript
// ✅ CORRECT - Validate dimensions
const collectionInfo = await qdrantClient.getCollection(collectionName);
const expectedDims = collectionInfo.config?.params?.vectors?.size;

for (const chunk of chunks) {
  if (chunk.embedding.length !== expectedDims) {
    throw new Error(
      `Dimension mismatch: expected ${expectedDims}, got ${chunk.embedding.length}`
    );
  }
}

await qdrantClient.upsert(collectionName, { points: ... });
```

### Pitfall 3: Fallback Without Migration

```typescript
// ❌ WRONG - Mixing models over time
try {
  return await openaiClient.generateEmbedding(text);
} catch (error) {
  // Fallback to different model - creates mixed collection!
  return await embeddingClient.generateHuggingFaceEmbedding(text);
}
```

**Fix**:
```typescript
// ✅ CORRECT - Fail fast, no mixing
try {
  return await openaiClient.generateEmbedding(text);
} catch (error) {
  throw new Error(
    `OpenAI embedding generation failed. Cannot fallback as this would ` +
    `create dimension mismatch. Error: ${error.message}`
  );
}
```

---

## 📋 Migration Checklist

When changing embedding models:

- [ ] **Choose new model** and document decision
- [ ] **Test new model** with sample documents
- [ ] **Update constants** (EMBEDDING_MODEL in codebase)
- [ ] **Create migration script**:
  - [ ] Fetch all documents from database
  - [ ] Reprocess each document with new model
  - [ ] Store in new Qdrant collection (temp)
  - [ ] Verify search works with new embeddings
  - [ ] Atomic switch to new collection
  - [ ] Delete old collection
- [ ] **Update documentation** (this file, CLAUDE.md)
- [ ] **Test query pipeline** with new embeddings
- [ ] **Monitor search quality** after migration
- [ ] **Rollback plan** if issues arise

---

## 🔄 Migration Guides

### Migration 1: Changing Embedding Models

**Scenario**: Switching from `text-embedding-3-small` (1536d) to `text-embedding-3-large` (3072d) for better search quality

**Impact**: HIGH - All documents must be reprocessed, all collections recreated

**Preparation Steps**:
```typescript
// 1. Calculate migration scope
const documentCount = await supabase
  .from("documents")
  .select("id", { count: "exact" })
  .eq("status", "ready");

console.log(`Migration will reprocess ${documentCount.count} documents`);

// 2. Estimate time and cost
const avgProcessingTime = 30; // seconds per document
const estimatedTime = (documentCount.count * avgProcessingTime) / 3600; // hours
const embeddingCost = (documentCount.count * 1000 * 0.00013) / 1000; // $0.00013 per 1K tokens

console.log(`Estimated time: ${estimatedTime.toFixed(1)} hours`);
console.log(`Estimated cost: $${embeddingCost.toFixed(2)}`);
```

**Migration Script**:
```typescript
// migrate-embeddings.ts
import { createClient } from "@supabase/supabase-js";
import { QdrantClient } from "qdrant-js";
import OpenAI from "openai";

const OLD_MODEL = "text-embedding-3-small";
const NEW_MODEL = "text-embedding-3-large";
const NEW_DIMENSIONS = 3072;

async function migrateEmbeddings() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const qdrant = new QdrantClient({ url: QDRANT_URL });
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  // 1. Get all projects
  const { data: projects } = await supabase
    .from("projects")
    .select("id, user_id");

  for (const project of projects) {
    const userId = project.user_id;
    const projectId = project.id;

    const oldCollection = `insightsphere_user_${userId}_project_${projectId}`;
    const newCollection = `${oldCollection}_new`;

    console.log(`Migrating project ${projectId}...`);

    // 2. Create new collection with new dimensions
    await qdrant.createCollection(newCollection, {
      vectors: {
        size: NEW_DIMENSIONS,
        distance: "Cosine"
      }
    });

    // 3. Get all documents for this project
    const { data: documents } = await supabase
      .from("documents")
      .select("id, storage_path")
      .eq("project_id", projectId)
      .eq("status", "ready");

    // 4. Reprocess each document
    for (const doc of documents) {
      try {
        // Fetch existing chunks from old collection
        const chunks = await qdrant.scroll(oldCollection, {
          filter: {
            must: [{ key: "documentId", match: { value: doc.id } }]
          },
          limit: 1000
        });

        // Generate new embeddings
        const texts = chunks.points.map(p => p.payload.content);
        const embeddings = await openai.embeddings.create({
          model: NEW_MODEL,
          input: texts
        });

        // Upsert to new collection
        const points = embeddings.data.map((emb, idx) => ({
          id: chunks.points[idx].id,
          vector: emb.embedding,
          payload: chunks.points[idx].payload
        }));

        await qdrant.upsert(newCollection, { points });

        console.log(`  ✓ Migrated document ${doc.id}`);
      } catch (error) {
        console.error(`  ✗ Failed document ${doc.id}:`, error.message);
        // Continue with next document
      }
    }

    // 5. Verify new collection
    const oldCount = await qdrant.getCollection(oldCollection);
    const newCount = await qdrant.getCollection(newCollection);

    if (oldCount.points_count === newCount.points_count) {
      console.log(`✓ Collection ${projectId} verified (${newCount.points_count} points)`);

      // 6. Atomic swap (rename collections)
      await qdrant.deleteCollection(oldCollection);
      await qdrant.updateCollectionName(newCollection, oldCollection);

      console.log(`✓ Project ${projectId} migration complete`);
    } else {
      console.error(`✗ Point count mismatch for ${projectId}`);
      console.error(`  Old: ${oldCount.points_count}, New: ${newCount.points_count}`);
      // Keep both collections for manual review
    }
  }

  console.log("Migration complete!");
}

// Run with error handling
migrateEmbeddings().catch(console.error);
```

**Rollback Plan**:
```bash
# If issues arise, rollback is simple since old collections still exist
# Just delete the "_new" collections

for collection in $(curl http://localhost:6333/collections | jq -r '.result.collections[].name | select(endswith("_new"))'); do
  curl -X DELETE http://localhost:6333/collections/$collection
done
```

---

### Migration 2: Changing Qdrant Collection Strategy

**Scenario**: Moving from per-project collections to single shared collection with filtering

**Impact**: MEDIUM - Data migration required, no reprocessing needed

**Why Migrate?**: Cross-project search, reduced collection management overhead

**Trade-offs**:
- ✅ Enables cross-project search
- ✅ Simpler collection management
- ❌ Requires careful access control filtering
- ❌ Harder to delete project data

**Migration Script**:
```typescript
// migrate-to-shared-collection.ts
async function migrateToSharedCollection() {
  const SHARED_COLLECTION = "insightsphere_global";

  // 1. Create shared collection
  await qdrant.createCollection(SHARED_COLLECTION, {
    vectors: { size: 1536, distance: "Cosine" }
  });

  // 2. Get all existing collections
  const collections = await qdrant.getCollections();
  const projectCollections = collections.collections.filter(c =>
    c.name.startsWith("insightsphere_user_")
  );

  // 3. Migrate each collection
  for (const collection of projectCollections) {
    console.log(`Migrating ${collection.name}...`);

    // Extract userId and projectId from collection name
    const match = collection.name.match(/insightsphere_user_(.+)_project_(.+)/);
    if (!match) continue;

    const [_, userId, projectId] = match;

    // Scroll through all points in old collection
    let offset = null;
    do {
      const result = await qdrant.scroll(collection.name, {
        limit: 100,
        offset
      });

      // Update payload to include userId/projectId
      const points = result.points.map(point => ({
        ...point,
        payload: {
          ...point.payload,
          userId,
          projectId
        }
      }));

      // Insert into shared collection
      await qdrant.upsert(SHARED_COLLECTION, { points });

      offset = result.next_page_offset;
      console.log(`  Migrated ${points.length} points`);
    } while (offset);

    // Verify point count matches
    const oldCount = await qdrant.count(collection.name);
    const newCount = await qdrant.count(SHARED_COLLECTION, {
      filter: {
        must: [
          { key: "userId", match: { value: userId } },
          { key: "projectId", match: { value: projectId } }
        ]
      }
    });

    console.log(`✓ ${collection.name}: ${oldCount} → ${newCount} points`);

    // Delete old collection after verification
    await qdrant.deleteCollection(collection.name);
  }

  console.log("Migration to shared collection complete!");
}
```

**Update Search Queries**:
```typescript
// Before (per-project collection)
const results = await qdrantClient.search(
  `insightsphere_user_${userId}_project_${projectId}`,
  {
    vector: queryEmbedding,
    limit: 10
  }
);

// After (shared collection with filters)
const results = await qdrantClient.search(SHARED_COLLECTION, {
  vector: queryEmbedding,
  filter: {
    must: [
      { key: "userId", match: { value: userId } },
      { key: "projectId", match: { value: projectId } }
    ]
  },
  limit: 10
});
```

---

### Migration 3: Upgrading from Svelte 4 to Svelte 5

**Scenario**: Frontend framework upgrade with breaking changes to reactive system

**Impact**: MEDIUM - Code refactoring required, no data migration

**Key Changes**:
1. `let` → `$state()` for reactive variables
2. `$:` → `$derived()` for computed values
3. `$:` → `$effect()` for side effects
4. `on:` → `onclick` for event handlers
5. `export let` → `$props()` for component props

**Migration Script**:
```bash
# Use svelte-migrate tool
npx svelte-migrate@latest svelte-5

# Review changes manually
git diff
```

**Manual Refactoring Examples**:

```typescript
// BEFORE (Svelte 4)
<script lang="ts">
  export let userId: string;
  let count = 0;
  let doubled = 0;

  $: doubled = count * 2;

  $: {
    console.log("Count changed:", count);
  }

  function increment() {
    count++;
  }
</script>

<button on:click={increment}>Count: {count}</button>
<div>Doubled: {doubled}</div>

// AFTER (Svelte 5)
<script lang="ts">
  let { userId } = $props<{ userId: string }>();

  let count = $state(0);
  let doubled = $derived(count * 2);

  $effect(() => {
    console.log("Count changed:", count);
  });

  function increment() {
    count++;
  }
</script>

<button onclick={increment}>Count: {count}</button>
<div>Doubled: {doubled}</div>
```

**Testing Checklist**:
- [ ] All components render correctly
- [ ] Reactive state updates trigger UI changes
- [ ] Event handlers fire correctly
- [ ] Props pass down to child components
- [ ] Two-way binding works with `$bindable`
- [ ] Effects run at appropriate times
- [ ] No infinite loops in `$effect`

---

### Migration 4: Database Schema Changes

**Scenario**: Adding new fields to documents table without breaking existing code

**Impact**: LOW - Requires database migration, minimal code changes

**Example**: Adding `processing_metadata` JSONB column

**Migration SQL**:
```sql
-- 1. Add new column (nullable initially)
ALTER TABLE documents
ADD COLUMN processing_metadata JSONB DEFAULT '{}'::jsonb;

-- 2. Backfill existing documents with default metadata
UPDATE documents
SET processing_metadata = jsonb_build_object(
  'chunks_count', 0,
  'tokens_count', 0,
  'processing_time_ms', 0,
  'model_version', 'v1.0',
  'migrated_at', now()
)
WHERE processing_metadata IS NULL;

-- 3. Make column non-nullable (after backfill)
ALTER TABLE documents
ALTER COLUMN processing_metadata SET NOT NULL;

-- 4. Add index for common queries
CREATE INDEX idx_documents_processing_metadata
ON documents USING gin (processing_metadata);

-- 5. Verify migration
SELECT
  COUNT(*) as total_documents,
  COUNT(*) FILTER (WHERE processing_metadata IS NOT NULL) as with_metadata
FROM documents;
```

**Update TypeScript Types**:
```typescript
// shared/types/index.ts
export interface Document {
  id: string;
  project_id: string;
  user_id: string;
  file_name: string;
  file_type: "pdf" | "docx";
  file_size: number;
  storage_path: string;
  status: "uploaded" | "processing" | "ready" | "failed";

  // NEW FIELD
  processing_metadata: {
    chunks_count: number;
    tokens_count: number;
    processing_time_ms: number;
    model_version: string;
    embedding_model?: string;
    ocr_language?: string;
  };

  created_at: string;
  updated_at: string;
}
```

**Update API Code**:
```typescript
// api/routes/documents/process.ts
await supabase
  .from("documents")
  .update({
    status: "ready",
    // NEW: Store processing metadata
    processing_metadata: {
      chunks_count: chunks.length,
      tokens_count: totalTokens,
      processing_time_ms: Date.now() - startTime,
      model_version: "v1.0",
      embedding_model: "text-embedding-3-small",
      ocr_language: "eng"
    }
  })
  .eq("id", documentId);
```

**Rollback Plan**:
```sql
-- If migration causes issues, rollback is simple
ALTER TABLE documents DROP COLUMN processing_metadata;
```

---

## 📚 Related Documentation

- [RAG Pipeline](./rag-pipeline.md) - Complete RAG implementation
- [Qdrant Patterns](./qdrant.md) - Vector database best practices
- [OpenAI API Docs](https://platform.openai.com/docs/guides/embeddings) - Official embedding guide

---

**Key Takeaway**: Embedding consistency is non-negotiable. Always use the same model for documents and queries.
