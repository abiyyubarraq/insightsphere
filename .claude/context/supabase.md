# Supabase Integration Guide

**Comprehensive guide to using Supabase for authentication, database, and storage in InsightSphere.**

---

## Table of Contents

1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [Row-Level Security (RLS)](#row-level-security-rls)
4. [Authentication](#authentication)
5. [Storage Operations](#storage-operations)
6. [API Client Usage](#api-client-usage)
7. [Common Patterns](#common-patterns)
8. [Best Practices](#best-practices)
9. [Migrations](#migrations)

---

## Overview

### Supabase Services Used

InsightSphere leverages three core Supabase services:

| Service | Purpose | Usage |
|---------|---------|-------|
| **PostgreSQL** | Relational database | Projects, documents, metadata |
| **Auth** | User authentication | JWT tokens, session management |
| **Storage** | File storage | PDF/DOCX files before processing |

### Architecture

```
Frontend (Supabase Client)
  ↓
  JWT Token
  ↓
API (Service Role Key)
  ↓
Supabase Cloud
  ├── PostgreSQL (Data)
  ├── Auth (Users)
  └── Storage (Files)
```

### Client Types

#### 1. Service Role Client (API Backend)

Used in **API service** for server-side operations with full database access.

```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,  // Full access
  {
    auth: {
      autoRefreshToken: false,  // Server doesn't need refresh
      persistSession: false      // Stateless API
    }
  }
);
```

**Permissions**: Bypasses Row-Level Security (RLS) - use carefully!

#### 2. Anon/Public Client (Frontend)

Used in **frontend** for client-side operations with RLS enforcement.

```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,  // Public key
  {
    auth: {
      autoRefreshToken: true,   // Auto-refresh JWT
      persistSession: true       // Store session in localStorage
    }
  }
);
```

**Permissions**: RLS policies enforced for data security.

---

## Database Schema

### Core Tables

#### `projects`

**Purpose**: Organize documents into project-based collections

```sql
CREATE TABLE projects (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Metadata
  name TEXT NOT NULL,
  description TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_created_at ON projects(created_at DESC);

-- RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
```

**Key Points**:
- `user_id` foreign key with `ON DELETE CASCADE` (delete user → delete projects)
- Indexes on `user_id` for fast filtering
- Timestamps for sorting and auditing

#### `project_files` (Documents)

**Purpose**: Store document metadata and processing status

```sql
CREATE TABLE project_files (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,

  -- File Info
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,

  -- Processing Status
  status TEXT DEFAULT 'uploading' NOT NULL
    CHECK (status IN ('uploading', 'processing', 'ready', 'failed')),

  -- Optional Metadata
  summary TEXT,
  is_summary_exist BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  image_paths JSONB,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_project_files_project_id ON project_files(project_id);
CREATE INDEX idx_project_files_user_id ON project_files(user_id);
CREATE INDEX idx_project_files_status ON project_files(status);
CREATE INDEX idx_project_files_created_at ON project_files(created_at DESC);

-- RLS
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;
```

**Key Points**:
- `project_id` foreign key with `ON DELETE CASCADE` (delete project → delete files)
- `status` enum-like constraint for valid states
- `metadata` JSONB for flexible document data
- `image_paths` JSONB for page-to-image mappings (OCR intermediate)

#### Status State Machine

```
uploading → processing → ready
                ↓
              failed
```

**Status Meanings**:
- `uploading`: File being uploaded to Supabase Storage
- `processing`: Parser extracting text, API generating embeddings
- `ready`: Document processed and searchable
- `failed`: Processing error occurred (see logs)

### Document Record TypeScript Interface

```typescript
export interface DocumentRecord {
  id: string;
  project_id: string;
  user_id: string;
  file_name: string;
  storage_path: string;
  status: "uploading" | "processing" | "ready" | "failed";
  summary?: string | null;
  is_summary_exist?: boolean;
  metadata?: Record<string, any>;
  image_paths?: Record<number, string>;
  created_at: string;
  updated_at: string;
}
```

---

## Row-Level Security (RLS)

### Why RLS?

**Problem**: Service Role Key bypasses all security.

**Solution**: RLS policies enforce data access at the **database level**, even if service role is used (with explicit bypass required).

### RLS Best Practices

1. ✅ **Enable RLS on all user-facing tables**
2. ✅ **Separate policies for SELECT, INSERT, UPDATE, DELETE**
3. ✅ **Use `auth.uid()` to reference current user**
4. ✅ **Test policies with both service role and anon key**

### Example Policies

#### Projects Table

```sql
-- Policy: Users can view their own projects
CREATE POLICY "Users can view own projects"
  ON projects
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can create projects for themselves
CREATE POLICY "Users can create own projects"
  ON projects
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own projects
CREATE POLICY "Users can update own projects"
  ON projects
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own projects
CREATE POLICY "Users can delete own projects"
  ON projects
  FOR DELETE
  USING (auth.uid() = user_id);
```

#### Project Files Table

```sql
-- Policy: Users can view documents in their projects
CREATE POLICY "Users can view own project files"
  ON project_files
  FOR SELECT
  USING (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_files.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- Policy: Users can insert files into their projects
CREATE POLICY "Users can upload to own projects"
  ON project_files
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_files.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- Policy: Users can update their own files
CREATE POLICY "Users can update own files"
  ON project_files
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own files
CREATE POLICY "Users can delete own files"
  ON project_files
  FOR DELETE
  USING (auth.uid() = user_id);
```

### Testing RLS Policies

```sql
-- Test as user
SET request.jwt.claims = '{"sub": "user-id-here"}';

-- Try to access another user's project
SELECT * FROM projects WHERE user_id != 'user-id-here';
-- Should return empty result (RLS blocks it)

-- Try to access own projects
SELECT * FROM projects WHERE user_id = 'user-id-here';
-- Should return results
```

---

## Authentication

### Sign Up (Frontend)

```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) {
    console.error("Sign up failed:", error.message);
    return null;
  }

  // Check if email confirmation is required
  if (data.user && !data.session) {
    console.log("Please check your email for confirmation link");
  }

  return data.user;
}
```

### Sign In (Frontend)

```typescript
async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    console.error("Sign in failed:", error.message);
    return null;
  }

  // Session is automatically stored in localStorage
  console.log("Access token:", data.session?.access_token);
  return data.user;
}
```

### Sign Out (Frontend)

```typescript
async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Sign out failed:", error.message);
  }

  // Session is automatically cleared from localStorage
}
```

### Get Current User (Frontend)

```typescript
async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    console.log("No user signed in");
    return null;
  }

  return user;
}
```

### Auth State Listener (Frontend)

```typescript
// Listen for auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  console.log("Auth event:", event);

  if (event === "SIGNED_IN") {
    console.log("User signed in:", session?.user);
  }

  if (event === "SIGNED_OUT") {
    console.log("User signed out");
  }

  if (event === "TOKEN_REFRESHED") {
    console.log("Token refreshed");
  }

  if (event === "USER_UPDATED") {
    console.log("User updated:", session?.user);
  }
});
```

### JWT Validation (API Backend)

```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

export async function validateToken(token: string): Promise<{ id: string; email?: string } | null> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email
    };
  } catch (error) {
    console.error("Token validation failed:", error);
    return null;
  }
}
```

### Auth Middleware (API - Hono)

```typescript
import { Context, Next } from "hono";

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.substring(7);
  const user = await validateToken(token);

  if (!user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  // Attach user to context
  c.set("userId", user.id);
  c.set("userEmail", user.email);

  await next();
}

// Usage
import { Hono } from "hono";

const app = new Hono();

// Protected route
app.get("/v1/projects", authMiddleware, async (c) => {
  const userId = c.get("userId");

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId);

  return c.json({ projects: data });
});
```

---

## Storage Operations

### Storage Bucket Structure

```
supabase-storage/
  └── anotherbrainfileplayground/  (bucket name)
      └── {userId}/
          └── {projectId}/
              └── {documentId}/
                  └── document.pdf
```

**Path Example**: `user-123/project-456/doc-789/report.pdf`

### Upload File (Frontend)

```typescript
async function uploadDocument(
  projectId: string,
  file: File
): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const documentId = crypto.randomUUID();
  const storagePath = `${user.id}/${projectId}/${documentId}/${file.name}`;

  // 1. Upload to Storage
  const { data, error } = await supabase.storage
    .from("anotherbrainfileplayground")
    .upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false  // Don't overwrite existing files
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  // 2. Create database record
  const { error: dbError } = await supabase
    .from("project_files")
    .insert({
      id: documentId,
      project_id: projectId,
      user_id: user.id,
      file_name: file.name,
      storage_path: storagePath,
      status: "uploading"
    });

  if (dbError) {
    // Rollback: delete uploaded file
    await supabase.storage.from("anotherbrainfileplayground").remove([storagePath]);
    throw new Error(`Database insert failed: ${dbError.message}`);
  }

  return documentId;
}
```

### Download File (API Backend)

```typescript
import { SupabaseService } from "./supabaseClient.ts";

const supabase = new SupabaseService();

async function downloadDocument(
  documentId: string,
  userId: string
): Promise<Uint8Array> {
  // 1. Get document record (validates ownership)
  const document = await supabase.getDocument(documentId, userId);

  // 2. Download file from storage
  const { data, error } = await supabase.client.storage
    .from("anotherbrainfileplayground")
    .download(document.storage_path);

  if (error) {
    throw new Error(`Download failed: ${error.message}`);
  }

  // 3. Convert Blob to Uint8Array
  const arrayBuffer = await data.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
```

### Delete File (Frontend)

```typescript
async function deleteDocument(documentId: string) {
  // 1. Get document record
  const { data: document, error: fetchError } = await supabase
    .from("project_files")
    .select("storage_path")
    .eq("id", documentId)
    .single();

  if (fetchError || !document) {
    throw new Error("Document not found");
  }

  // 2. Delete from storage
  const { error: storageError } = await supabase.storage
    .from("anotherbrainfileplayground")
    .remove([document.storage_path]);

  if (storageError) {
    console.warn("Storage delete failed:", storageError);
  }

  // 3. Delete database record
  const { error: dbError } = await supabase
    .from("project_files")
    .delete()
    .eq("id", documentId);

  if (dbError) {
    throw new Error(`Database delete failed: ${dbError.message}`);
  }
}
```

### Get Signed URL (Temporary Access)

```typescript
async function getDocumentUrl(
  documentId: string
): Promise<string> {
  // 1. Get document record
  const { data: document, error } = await supabase
    .from("project_files")
    .select("storage_path")
    .eq("id", documentId)
    .single();

  if (error || !document) {
    throw new Error("Document not found");
  }

  // 2. Generate signed URL (1 hour expiry)
  const { data: urlData, error: urlError } = await supabase.storage
    .from("anotherbrainfileplayground")
    .createSignedUrl(document.storage_path, 3600);

  if (urlError || !urlData) {
    throw new Error("Failed to generate URL");
  }

  return urlData.signedUrl;
}
```

---

## API Client Usage

### SupabaseService Class (Backend)

```typescript
// api/lib/supabaseClient.ts
export class SupabaseService {
  private client: SupabaseClient;
  private bucketName: string;

  constructor() {
    this.client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    this.bucketName = Deno.env.get("SUPABASE_STORAGE_BUCKET") || "anotherbrainfileplayground";
  }

  // Download file from storage
  async downloadFile(storagePath: string): Promise<Uint8Array> {
    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .download(storagePath);

    if (error) throw new Error(`Download failed: ${error.message}`);

    const arrayBuffer = await data.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  // Get document with ownership validation
  async getDocument(documentId: string, userId: string): Promise<DocumentRecord> {
    const { data, error } = await this.client
      .from("project_files")
      .select("*")
      .eq("id", documentId)
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      throw new Error("Document not found or access denied");
    }

    return data as DocumentRecord;
  }

  // Update document status
  async updateDocument(
    documentId: string,
    updates: { status?: string; summary?: string; metadata?: any }
  ): Promise<void> {
    const { error } = await this.client
      .from("project_files")
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq("id", documentId);

    if (error) throw new Error(`Update failed: ${error.message}`);
  }

  // Validate project access
  async validateProjectAccess(projectId: string, userId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", userId)
      .single();

    return !error && !!data;
  }
}

// Singleton export
export const supabaseService = new SupabaseService();
```

---

## Common Patterns

### Pattern 1: Validate Ownership Before Action

```typescript
// API endpoint example
export async function processDocument(c: Context) {
  const userId = c.get("userId");  // From auth middleware
  const { document_id, project_id } = await c.req.json();

  // 1. Validate project ownership
  const hasProjectAccess = await supabaseService.validateProjectAccess(
    project_id,
    userId
  );

  if (!hasProjectAccess) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // 2. Validate document ownership
  const document = await supabaseService.getDocument(document_id, userId);

  // 3. Proceed with processing
  await processDocumentPipeline(document);

  return c.json({ success: true });
}
```

### Pattern 2: Transaction-Like Operations

Supabase doesn't expose transactions in client library, but you can:

```typescript
async function createProjectWithDocuments(
  userId: string,
  projectName: string,
  files: File[]
): Promise<string> {
  // 1. Create project
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      name: projectName
    })
    .select()
    .single();

  if (projectError || !project) {
    throw new Error("Failed to create project");
  }

  try {
    // 2. Upload files
    const documentIds: string[] = [];

    for (const file of files) {
      const documentId = await uploadDocument(project.id, file);
      documentIds.push(documentId);
    }

    return project.id;
  } catch (error) {
    // Rollback: delete project (cascade deletes files)
    await supabase.from("projects").delete().eq("id", project.id);
    throw error;
  }
}
```

### Pattern 3: Batch Operations

```typescript
// Fetch all documents for multiple projects
async function getDocumentsForProjects(
  userId: string,
  projectIds: string[]
): Promise<DocumentRecord[]> {
  const { data, error } = await supabase
    .from("project_files")
    .select("*")
    .eq("user_id", userId)
    .in("project_id", projectIds)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Fetch failed: ${error.message}`);

  return data as DocumentRecord[];
}
```

### Pattern 4: Pagination

```typescript
async function getDocumentsPaginated(
  userId: string,
  projectId: string,
  page: number,
  pageSize: number = 20
): Promise<{ documents: DocumentRecord[]; total: number }> {
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;

  // Get paginated results
  const { data, error, count } = await supabase
    .from("project_files")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .range(start, end);

  if (error) throw new Error(`Fetch failed: ${error.message}`);

  return {
    documents: data as DocumentRecord[],
    total: count || 0
  };
}
```

---

## Best Practices

### 1. Always Validate Ownership

```typescript
// ❌ Bad - trusts client input
const document = await supabase
  .from("project_files")
  .select("*")
  .eq("id", documentId)
  .single();

// ✅ Good - validates user ownership
const document = await supabase
  .from("project_files")
  .select("*")
  .eq("id", documentId)
  .eq("user_id", userId)
  .single();
```

### 2. Use Service Role Carefully

```typescript
// ❌ Bad - service role without validation
const allDocuments = await supabase.from("project_files").select("*");  // Returns ALL users' data!

// ✅ Good - service role with explicit filtering
const userDocuments = await supabase
  .from("project_files")
  .select("*")
  .eq("user_id", userId);
```

### 3. Handle Errors Gracefully

```typescript
async function safeGetDocument(documentId: string, userId: string) {
  try {
    const { data, error } = await supabase
      .from("project_files")
      .select("*")
      .eq("id", documentId)
      .eq("user_id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {  // Not found
        return { error: "Document not found", status: 404 };
      }
      return { error: "Database error", status: 500 };
    }

    return { data, status: 200 };
  } catch (error) {
    console.error("Unexpected error:", error);
    return { error: "Internal server error", status: 500 };
  }
}
```

### 4. Use Indexes for Performance

```sql
-- ✅ Good - index on frequently filtered columns
CREATE INDEX idx_project_files_user_id ON project_files(user_id);
CREATE INDEX idx_project_files_project_id ON project_files(project_id);
CREATE INDEX idx_project_files_status ON project_files(status);

-- ✅ Good - composite index for common queries
CREATE INDEX idx_project_files_user_project ON project_files(user_id, project_id);
```

### 5. Clean Up Storage on Delete

```typescript
// ✅ Good - delete storage file when database record deleted
async function deleteDocument(documentId: string) {
  // 1. Get storage path
  const { data: doc } = await supabase
    .from("project_files")
    .select("storage_path")
    .eq("id", documentId)
    .single();

  // 2. Delete database record first
  await supabase.from("project_files").delete().eq("id", documentId);

  // 3. Delete storage file (best effort)
  if (doc?.storage_path) {
    await supabase.storage.from("bucket").remove([doc.storage_path]);
  }
}
```

---

## Migrations

### Manual Migration Example

```sql
-- Create new table
CREATE TABLE document_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES project_files(id) ON DELETE CASCADE NOT NULL,
  summary TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Add index
CREATE INDEX idx_document_summaries_document_id ON document_summaries(document_id);

-- Enable RLS
ALTER TABLE document_summaries ENABLE ROW LEVEL SECURITY;

-- Add RLS policy
CREATE POLICY "Users can view summaries for their documents"
  ON document_summaries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_files
      WHERE project_files.id = document_summaries.document_id
      AND project_files.user_id = auth.uid()
    )
  );
```

### Migration Checklist

- [ ] Add table/column
- [ ] Add indexes for foreign keys and frequently filtered columns
- [ ] Enable RLS on user-facing tables
- [ ] Create RLS policies for SELECT, INSERT, UPDATE, DELETE
- [ ] Test policies with different user roles
- [ ] Update TypeScript types
- [ ] Update API client methods
- [ ] Deploy and verify

---

## Related Documentation

- [Architecture](architecture.md) - System architecture overview
- [Design Principles](design-principles.md) - Coding standards
- [Overview](overview.md) - Project overview and features

---

**Last Updated**: 2025-11-29
**Maintained By**: InsightSphere Backend Team
