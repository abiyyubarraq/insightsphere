# Document Processing Pipeline Implementation

This README covers the complete document processing pipeline implementation for InsightSphere.

## 🏗️ Architecture Overview

The document processing pipeline consists of:

1. **API Endpoint**: `POST /v1/documents/process` - Main orchestration endpoint
2. **Supabase Integration**: File download and metadata management
3. **Go Parser Service**: PDF/DOCX text extraction
4. **Text Chunking**: Intelligent text segmentation with overlap
5. **OpenAI Embeddings**: Vector generation for semantic search
6. **Qdrant Storage**: Vector database for similarity search

## 📁 Files Created

### Core Library Modules (`api/lib/`)

- **`openaiClient.ts`** - OpenAI API wrapper for embeddings
- **`qdrantClient.ts`** - Qdrant vector database operations
- **`chunkText.ts`** - Text chunking with sentence preservation
- **`supabaseClient.ts`** - Backend Supabase operations

### API Routes (`api/routes/`)

- **`documents/process.ts`** - Main document processing endpoint

### Shared Types (`shared/types/`)

- Updated with document processing interfaces
- Added vector search metadata
- Enhanced document status and metadata fields

## 🔧 Environment Variables

Add these environment variables to your `.env` file:

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key

# Qdrant Configuration
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your-qdrant-api-key-if-needed
QDRANT_COLLECTION=insightsphere-docs

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=anotherbrainfileplayground

# Document Parser Service
DOC_PARSER_URL=http://localhost:8080

# API Server
PORT=8000
```

## 🚀 API Usage

### Process Document Endpoint

**Endpoint**: `POST /v1/documents/process`

**Headers**:
```
Authorization: Bearer <user-jwt-token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "project_id": "uuid-of-project",
  "document_id": "uuid-of-document", 
  "storage_path": "user_id/project_id/timestamp_filename.pdf"
}
```

**Response** (Success):
```json
{
  "success": true,
  "document_id": "uuid-of-document",
  "chunks_created": 15,
  "processing_time_ms": 3240
}
```

**Response** (Error):
```json
{
  "success": false,
  "document_id": "",
  "chunks_created": 0,
  "processing_time_ms": 1200,
  "error": "Parser service failed: 500 Internal Server Error"
}
```

### Example cURL Command

```bash
curl -X POST http://localhost:8000/v1/documents/process \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "550e8400-e29b-41d4-a716-446655440000",
    "document_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "storage_path": "user123/project456/1699123456789_document.pdf"
  }'
```

## 🔄 Processing Flow

1. **Authentication**: Validate JWT token and extract user ID
2. **Authorization**: Check user owns document and has project access
3. **Status Update**: Set document status to "processing"
4. **File Download**: Fetch file from Supabase Storage using service key
5. **Parser Call**: Send file to Go microservice for text extraction
6. **Text Chunking**: Split text into 800-token chunks with 100-token overlap
7. **Embedding Generation**: Create embeddings using OpenAI text-embedding-3-small
8. **Vector Storage**: Store chunks and embeddings in Qdrant with metadata
9. **Status Update**: Set document status to "ready" with processing metadata

## 📊 Metadata Stored

Each chunk stored in Qdrant includes:

```typescript
{
  id: "doc-uuid_chunk_0",
  content: "The actual text content...",
  embedding: [0.1, -0.2, 0.3, ...], // 1536-dimensional vector
  metadata: {
    documentId: "doc-uuid",
    projectId: "project-uuid", 
    userId: "user-uuid",
    chunkIndex: 0,
    pageNumber: 1, // if available
    fileName: "document.pdf",
    fileType: "pdf",
    createdAt: "2024-01-15T10:30:00.000Z"
  }
}
```

## ⚙️ Configuration Options

### Text Chunking Options

```typescript
const chunkOptions = {
  maxChunkSize: 800,        // Target tokens per chunk
  overlap: 100,             // Overlap tokens between chunks
  preserveSentences: true   // Keep sentences intact when possible
};
```

### Vector Search Filtering

The Qdrant client supports filtering by:
- `userId` - Ensure user isolation
- `projectId` - Limit search to specific project
- `documentId` - Search within specific document

## 🛠️ Development Setup

1. **Start Services**:
   ```bash
   # Start local development stack
   docker compose -f dev/compose.yaml up
   
   # Start Deno API server
   cd api && deno task dev
   
   # Start Go parser service (in separate terminal)
   cd doc-parsing && go run main.go
   ```

2. **Test the Pipeline**:
   ```bash
   # Upload a document first through the frontend
   # Then process it using the API endpoint
   ```

## 🔍 Monitoring & Debugging

### Logs to Watch For

- **File Download**: `Downloading file: user/project/file.pdf`
- **Parser Call**: `Sending to parser: http://localhost:8080/parse/pdf`
- **Chunking**: `Created 15 text chunks`
- **Embeddings**: `Generated 15 embeddings`
- **Storage**: `Stored 15 chunks in Qdrant`
- **Completion**: `Document processing completed in 3240ms`

### Common Issues

1. **Missing Environment Variables**: Check all required env vars are set
2. **Parser Service Down**: Ensure Go service is running on port 8080
3. **Qdrant Connection**: Verify Qdrant is accessible and collection exists
4. **OpenAI Limits**: Monitor API usage and rate limits
5. **File Permissions**: Ensure service has read/write access to temp files

## 🔒 Security Considerations

- Service role key used for backend Supabase access
- User isolation enforced at database and vector storage level
- Temporary files cleaned up after processing
- JWT token validation for all requests
- Project ownership validated before processing

## 📈 Performance Notes

- **Batch Embeddings**: Uses OpenAI batch API for better throughput
- **Sentence Preservation**: Maintains context across chunk boundaries
- **Configurable Chunking**: Adjustable token limits and overlap
- **Parallel Processing**: Concurrent embedding generation where possible
- **Memory Management**: Temporary files cleaned up automatically