# Qdrant Vector Database Guide

**Document Version**: 1.0
**Last Updated**: 2025-11-29
**Related Files**:
- [api/lib/qdrantClient.ts](../api/lib/qdrantClient.ts)
- [vector-utils/index.ts](../vector-utils/index.ts)

---

## 📖 Overview

Qdrant is the vector database powering InsightSphere's semantic search capabilities. This guide covers collection strategies, search patterns, performance optimization, and security best practices.

### Key Features Used

- **Vector Search**: Cosine similarity for text embeddings
- **Metadata Filtering**: Project and user isolation
- **Batch Operations**: Efficient bulk upserts
- **Dynamic Collections**: Per-project isolation strategy

---

## 🏗️ Collection Strategies

### Current Implementation: Per-Project Collections

**Collection Naming Convention**:
```typescript
`insightsphere_user_{userId}_project_{projectId}`

// Example
"insightsphere_user_a1b2c3d4_project_x7y8z9w0"
```

**Implementation** ([qdrantClient.ts:56-58](../api/lib/qdrantClient.ts#L56-L58)):
```typescript
private getProjectCollectionName(userId: string, projectId: string): string {
  return `${this.baseCollectionName}_user_${userId}_project_${projectId}`;
}
```

### Benefits of Per-Project Collections

| Benefit | Description |
|---------|-------------|
| **Perfect Isolation** | Each project has own collection, no cross-contamination |
| **Easy Deletion** | Delete entire project by deleting one collection |
| **Clear Boundaries** | Access control is straightforward |
| **Smaller Search Space** | Faster searches (fewer vectors to compare) |
| **Independent Scaling** | Large projects don't affect small ones |

### Trade-offs

| Trade-off | Impact | Mitigation |
|-----------|--------|-----------|
| **More Collections** | Higher memory overhead | Acceptable for <1000 projects |
| **Cannot Cross-Search** | Can't search across projects | By design - feature not needed |
| **Collection Management** | More collections to track | Lazy creation, automated cleanup |

### Alternative: Per-User Collections

**Naming**: `insightsphere_user_{userId}`

**When to Consider**:
- Users have <10 projects
- Need to search across all user's documents
- Want to minimize collection count

**Why Not Currently Used**:
- Project isolation is a core feature
- Users may have 10-100+ projects
- Harder to delete project data
- Larger search space = slower queries

---

## ⚙️ Collection Configuration

### Vector Configuration

```typescript
await qdrantClient.createCollection(collectionName, {
  vectors: {
    size: 1536,                // OpenAI text-embedding-3-small
    distance: "Cosine"        // Similarity metric
  }
});
```

### Distance Metrics

| Metric | Formula | Range | Use Case |
|--------|---------|-------|----------|
| **Cosine** | 1 - (A·B)/(‖A‖‖B‖) | 0 to 2 | Text embeddings (default) |
| Dot Product | A·B | -∞ to +∞ | Already normalized vectors |
| Euclidean | ‖A-B‖ | 0 to +∞ | Spatial data |

**Why Cosine for Text Embeddings?**
- Measures angle, not magnitude
- Invariant to vector length
- Standard for text similarity
- OpenAI embeddings are pre-normalized

### Lazy Collection Creation

**Strategy**: Create collections only when first document is uploaded

**Implementation** ([qdrantClient.ts:60-131](../api/lib/qdrantClient.ts#L60-L131)):
```typescript
async ensureCollection(
  userId: string,
  dimension: number,
  projectId?: string
): Promise<string> {
  const collectionName = projectId
    ? this.getProjectCollectionName(userId, projectId)
    : this.getCollectionName(userId);

  // Check if collection exists
  const collections = await this.client.getCollections();
  const exists = collections.collections.find(c => c.name === collectionName);

  if (exists) {
    // Verify dimensions match
    const collectionInfo = await this.client.getCollection(collectionName);
    const currentDimension = collectionInfo.config?.params?.vectors?.size;

    if (currentDimension && currentDimension !== dimension) {
      // Recreate collection with correct dimensions
      await this.client.deleteCollection(collectionName);
      await this.client.createCollection(collectionName, {
        vectors: { size: dimension, distance: "Cosine" }
      });
    }
  } else {
    // Create new collection
    await this.client.createCollection(collectionName, {
      vectors: { size: dimension, distance: "Cosine" }
    });
  }

  return collectionName;
}
```

**Benefits**:
- No empty collections
- Collections created on-demand
- Dimension mismatches detected and fixed

---

## 📦 Point Structure

### Point Schema

```typescript
interface QdrantPoint {
  id: string;                    // UUID (unique per chunk)
  vector: number[];              // 1536 floats (embedding)
  payload: {
    // Content
    content: string;             // Actual text chunk

    // Required metadata (always present)
    documentId: string;          // Source document UUID
    projectId: string;           // Project UUID (for filtering)
    userId: string;              // Owner UUID (for collection selection)
    fileName: string;            // Original filename (for citations)
    fileType: string;            // "pdf" | "docx"
    createdAt: string;           // ISO timestamp

    // Optional metadata (when available)
    pageNumber?: number;         // Page in document (for citations)
    chunkIndex: number;          // Position in document
    embeddingModel?: string;     // Model used (for debugging)
  };
}
```

### Point ID Generation

**Strategy**: Deterministic UUIDs based on document + chunk

**Implementation** ([chunkText.ts:228-241](../api/lib/chunkText.ts#L228-L241)):
```typescript
function createChunkId(
  documentId: string,
  chunkIndex: number,
  pageNumber?: number
): string {
  // Currently: random UUID
  return crypto.randomUUID();

  // Future: Deterministic UUID
  // const baseString = pageNumber
  //   ? `${documentId}_page${pageNumber}_chunk${chunkIndex}`
  //   : `${documentId}_chunk${chunkIndex}`;
  // return generateDeterministicUUID(baseString);
}
```

**Note**: Currently using random UUIDs for simplicity. Deterministic IDs would enable:
- Idempotent upserts (same chunk = same ID)
- Easy chunk updates
- Consistent references

---

## 🔍 Search Patterns

### Basic Similarity Search

```typescript
const results = await qdrantService.searchSimilar(queryVector, {
  userId: user.id,                  // Required (collection selection)
  projectId: project.id,            // Optional (filtering)
  useProjectCollection: true,       // Use per-project collection
  limit: 10,                        // Max results
  threshold: 0.7                    // Minimum similarity
});
```

### Search with Filters

**Implementation** ([qdrantClient.ts:236-256](../api/lib/qdrantClient.ts#L236-L256)):
```typescript
// Build filter
const filter: { must?: Array<{ key: string; match: { value: string } }> } = {};

if (projectId && !useProjectCollection) {
  // Filter by projectId if using user collection
  filter.must = filter.must || [];
  filter.must.push({
    key: "projectId",
    match: { value: projectId }
  });
}

if (documentId) {
  // Filter to specific document
  filter.must = filter.must || [];
  filter.must.push({
    key: "documentId",
    match: { value: documentId }
  });
}

// Execute search
const searchResult = await this.client.search(collectionName, {
  vector: queryVector,
  limit,
  score_threshold: threshold,
  filter: Object.keys(filter).length > 0 ? filter : undefined
});
```

### Search Result Structure

```typescript
interface SearchResult {
  id: string;                    // Point ID
  content: string;               // Chunk text
  score: number;                 // Cosine similarity (0-1)
  metadata: {
    documentId: string;
    projectId: string;
    userId: string;
    fileName: string;
    fileType: string;
    pageNumber?: number;
    chunkIndex: number;
    createdAt: string;
  };
}
```

### Similarity Thresholds

| Threshold | Interpretation | Use Case |
|-----------|---------------|----------|
| **0.9-1.0** | Nearly identical | Duplicate detection |
| **0.8-0.9** | Very similar | High precision search |
| **0.7-0.8** | Similar | Standard RAG retrieval |
| **0.5-0.7** | Somewhat related | Exploratory search |
| **<0.5** | Unrelated | Ignore |

**Current Default**: 0.7 (balances precision and recall)

```typescript
// Adjust threshold based on use case
const highPrecision = await qdrantService.searchSimilar(vector, {
  threshold: 0.85,  // Fewer but more relevant results
  limit: 5
});

const exploratory = await qdrantService.searchSimilar(vector, {
  threshold: 0.6,   // More results, broader coverage
  limit: 20
});
```

---

## 📝 CRUD Operations

### Create (Upsert Chunks)

**Implementation** ([qdrantClient.ts:133-184](../api/lib/qdrantClient.ts#L133-L184)):
```typescript
async upsertChunks(
  chunks: DocumentChunk[],
  options: { useProjectCollection?: boolean } = {}
): Promise<void> {
  if (chunks.length === 0) {
    throw new Error("No chunks provided");
  }

  const firstChunk = chunks[0];
  const { userId, projectId } = firstChunk.metadata;

  // Detect dimensions from embeddings
  const embeddingDimension = firstChunk.embedding.length;

  // Ensure collection exists
  const collectionName = await this.ensureCollection(
    userId,
    embeddingDimension,
    options.useProjectCollection ? projectId : undefined
  );

  // Prepare points
  const points = chunks.map(chunk => ({
    id: chunk.id,
    vector: chunk.embedding,
    payload: {
      content: chunk.content,
      ...chunk.metadata
    }
  }));

  // Upsert to Qdrant
  await this.client.upsert(collectionName, {
    wait: true,  // Wait for indexing
    points
  });
}
```

**Batch Upsert**:
```typescript
// Process large document in batches
const BATCH_SIZE = 100;

for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
  const batch = allChunks.slice(i, i + BATCH_SIZE);
  await qdrantService.upsertChunks(batch, { useProjectCollection: true });

  console.log(`Processed ${Math.min(i + BATCH_SIZE, allChunks.length)}/${allChunks.length} chunks`);
}
```

### Read (Search)

See [Search Patterns](#search-patterns) section above.

### Update (Modify Point Payload)

```typescript
// Update metadata without changing vector
await qdrantClient.setPayload(collectionName, {
  wait: true,
  points: [pointId],
  payload: {
    fileName: "updated_name.pdf",
    updatedAt: new Date().toISOString()
  }
});
```

**Use Cases**:
- Update filename after rename
- Add additional metadata
- Mark chunks as reviewed

### Delete

#### Delete by Document ID

**Implementation** ([qdrantClient.ts:292-336](../api/lib/qdrantClient.ts#L292-L336)):
```typescript
async deleteByDocumentId(
  documentId: string,
  userId: string,
  projectId?: string
): Promise<void> {
  const collections = [this.getCollectionName(userId)];
  if (projectId) {
    collections.push(this.getProjectCollectionName(userId, projectId));
  }

  for (const collectionName of collections) {
    try {
      await this.client.delete(collectionName, {
        wait: true,
        filter: {
          must: [{
            key: "documentId",
            match: { value: documentId }
          }]
        }
      });

      console.log(`Deleted chunks for document: ${documentId} from ${collectionName}`);
    } catch (error) {
      console.warn(`Could not delete from ${collectionName}:`, error);
    }
  }
}
```

#### Delete Entire Collection

```typescript
// Delete all project data
await qdrantClient.deleteCollection(
  `insightsphere_user_${userId}_project_${projectId}`
);
```

#### Delete All User Data

**Implementation** ([qdrantClient.ts:354-373](../api/lib/qdrantClient.ts#L354-L373)):
```typescript
async deleteUserData(userId: string): Promise<void> {
  // List all user's collections
  const userCollections = await this.listUserCollections(userId);

  // Delete each collection
  for (const collectionName of userCollections) {
    try {
      await this.client.deleteCollection(collectionName);
      console.log(`Deleted collection: ${collectionName}`);
    } catch (error) {
      console.warn(`Could not delete ${collectionName}:`, error);
    }
  }
}
```

---

## ⚡ Performance Optimization

### Batch Operations

**Single Insert** (slow):
```typescript
// ❌ Slow - 100 API calls
for (const chunk of chunks) {
  await qdrantClient.upsert(collectionName, {
    wait: true,
    points: [{ id: chunk.id, vector: chunk.embedding, payload: chunk.metadata }]
  });
}
```

**Batch Insert** (fast):
```typescript
// ✅ Fast - 1 API call (or ~1 call per 100 chunks)
await qdrantClient.upsert(collectionName, {
  wait: true,
  points: chunks.map(chunk => ({
    id: chunk.id,
    vector: chunk.embedding,
    payload: chunk.metadata
  }))
});
```

**Performance Impact**:
- 100 chunks: 100x faster with batching
- Network overhead eliminated
- Indexing done once after all inserts

### Connection Pooling

**Singleton Pattern** ([qdrantClient.ts:425-430](../api/lib/qdrantClient.ts#L425-L430)):
```typescript
// Export configured instance (reused across requests)
export const qdrantService = new QdrantService({
  url: Deno.env.get("QDRANT_URL") || "http://localhost:6333",
  apiKey: Deno.env.get("QDRANT_API_KEY"),
  collectionName: Deno.env.get("QDRANT_COLLECTION") || "insightsphere-documents"
});
```

**Benefits**:
- Connection reuse (no reconnection overhead)
- Reduced memory usage
- Better throughput

### Index Optimization

**HNSW Index** (Hierarchical Navigable Small World):
```typescript
await qdrantClient.createCollection(collectionName, {
  vectors: {
    size: 1536,
    distance: "Cosine"
  },
  hnsw_config: {
    m: 16,                // Number of connections per layer
    ef_construct: 100,    // Construction time quality
    full_scan_threshold: 10000  // Switch to full scan for small collections
  }
});
```

**Parameters**:
- **m**: Higher = better quality, more memory (default: 16)
- **ef_construct**: Higher = better index, slower build (default: 100)
- **full_scan_threshold**: For collections smaller than this, use brute force

**Recommendation**: Use defaults unless experiencing performance issues

### Query Optimization

```typescript
// ✅ Efficient - Filter + limit
const results = await qdrantClient.search(collectionName, {
  vector: queryVector,
  limit: 10,                      // Only retrieve top 10
  score_threshold: 0.7,           // Filter low-quality results
  filter: {
    must: [
      { key: "projectId", match: { value: projectId } }
    ]
  }
});

// ❌ Inefficient - No filter or limit
const results = await qdrantClient.search(collectionName, {
  vector: queryVector,
  limit: 1000                     // Too many results
  // No filters - searches all points
});
```

### Monitoring

```typescript
// Get collection statistics
const collectionInfo = await qdrantClient.getCollection(collectionName);

console.log("Collection stats:", {
  pointsCount: collectionInfo.points_count,
  indexedVectors: collectionInfo.indexed_vectors_count,
  vectorsCount: collectionInfo.vectors_count,
  status: collectionInfo.status
});
```

**Key Metrics**:
- **points_count**: Total points in collection
- **indexed_vectors_count**: Vectors in HNSW index
- **search_time**: Average search latency

---

## 🔒 Security & Access Control

### Multi-Tenancy with Per-Project Collections

**Security Model**:
1. **Collection-level isolation**: Each project has own collection
2. **Name-based access**: Collection name includes userId + projectId
3. **Filter-based protection**: Additional projectId filters in queries

**Implementation**:
```typescript
// User can only access their own collections
const collectionName = `insightsphere_user_${currentUser.id}_project_${projectId}`;

// Additional filter ensures project access
const results = await qdrantClient.search(collectionName, {
  vector: queryVector,
  filter: {
    must: [
      { key: "userId", match: { value: currentUser.id } },
      { key: "projectId", match: { value: projectId } }
    ]
  }
});
```

### Preventing Data Leakage

**Always Validate**:
```typescript
// ✅ Correct - Validate before search
async function searchDocuments(userId: string, projectId: string, query: string) {
  // 1. Validate project ownership
  const hasAccess = await supabaseService.validateProjectAccess(projectId, userId);
  if (!hasAccess) {
    throw new Error("Access denied to project");
  }

  // 2. Generate embedding
  const queryVector = await generateEmbedding(query);

  // 3. Search in user's project collection only
  const results = await qdrantService.searchSimilar(queryVector, {
    userId,                      // Collection selection
    projectId,                   // Additional filter
    useProjectCollection: true   // Per-project collection
  });

  return results;
}
```

**Never**:
```typescript
// ❌ Wrong - No access validation
async function searchDocuments(projectId: string, query: string) {
  // Missing: Who is the user? Do they have access?
  const results = await qdrantClient.search(collectionName, {
    vector: queryVector
  });
}
```

### API Key Security

```bash
# .env file (never commit)
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your-secret-api-key  # For production Qdrant Cloud

# Use in code
const qdrantClient = new QdrantClient({
  url: Deno.env.get("QDRANT_URL"),
  apiKey: Deno.env.get("QDRANT_API_KEY")  // Optional for local, required for cloud
});
```

---

## 🧪 Testing & Debugging

### Health Check

```typescript
async function checkQdrantHealth(): Promise<boolean> {
  try {
    const collections = await qdrantClient.getCollections();
    return collections !== null;
  } catch (error) {
    console.error("Qdrant health check failed:", error);
    return false;
  }
}
```

### Debugging Search Issues

```typescript
// Enable verbose logging
async function debugSearch(userId: string, projectId: string, query: string) {
  console.log("=== Qdrant Search Debug ===");

  // 1. Check collection exists
  const collectionName = `insightsphere_user_${userId}_project_${projectId}`;
  try {
    const collectionInfo = await qdrantClient.getCollection(collectionName);
    console.log("✅ Collection exists:", collectionName);
    console.log("  Points:", collectionInfo.points_count);
    console.log("  Dimensions:", collectionInfo.config?.params?.vectors?.size);
  } catch (error) {
    console.error("❌ Collection not found:", collectionName);
    return;
  }

  // 2. Generate query embedding
  const embedding = await generateEmbedding(query);
  console.log("✅ Query embedding:", embedding.length, "dimensions");

  // 3. Perform search
  const startTime = Date.now();
  const results = await qdrantClient.search(collectionName, {
    vector: embedding,
    limit: 10,
    score_threshold: 0.5  // Lower threshold for debugging
  });
  const searchTime = Date.now() - startTime;

  console.log("✅ Search completed in", searchTime, "ms");
  console.log("  Results:", results.length);
  results.forEach((result, i) => {
    console.log(`  [${i + 1}] Score: ${result.score.toFixed(3)}, Doc: ${result.payload?.fileName}`);
  });
}
```

### Common Issues

| Issue | Symptom | Solution |
|-------|---------|----------|
| **Collection not found** | Error: "Collection not found" | Check collection name, ensure document processed |
| **Dimension mismatch** | Error or zero results | Verify embedding dimensions match collection config |
| **Zero results** | Empty results array | Lower threshold, check if collection has points |
| **Slow searches** | High latency | Use filters, limit results, check collection size |

---

## 📚 Related Documentation

- [RAG Pipeline](./rag-pipeline.md) - Complete RAG implementation flow
- [Embedding Strategy](./embedding-strategy.md) - Embedding consistency details
- [Qdrant Documentation](https://qdrant.tech/documentation/) - Official Qdrant docs

---

**Key Takeaways**:
1. Per-project collections provide perfect isolation
2. Always filter searches by userId + projectId
3. Use batch operations for performance
4. Monitor collection sizes and search latency
5. Validate access before every operation
