// Re-export chat types
export * from "./chat.ts";

// Document types
export interface Document {
  id: string;
  fileName: string;
  fileType: "pdf" | "docx";
  uploadedAt: string;
  size: number;
  userId: string;
  status: "uploading" | "processing" | "ready" | "failed";
  metadata?: DocumentMetadata;
}

export interface DocumentMetadata {
  pages?: number;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  createdAt?: string;
  modifiedAt?: string;
  extractedText?: string;
  textLength?: number;
  chunkCount?: number;
  embeddingModel?: string;
  processedAt?: string;
}

// Document page types (per-page OCR storage)
export interface DocumentPage {
  id: string;
  documentId: string;
  pageNumber: number;
  text: string;
  charCount: number;
  extractionMethod: string;
  imageUrl?: string;
  createdAt: string;
}

// Analysis types
export interface AnalysisRequest {
  documentId: string;
  query: string;
  options?: AnalysisOptions;
}

export interface AnalysisOptions {
  maxTokens?: number;
  temperature?: number;
  includeContext?: boolean;
  model?: "gpt-4o" | "claude-3-sonnet";
}

export interface AnalysisResponse {
  id: string;
  documentId: string;
  query: string;
  analysis: string;
  keyPoints: string[];
  confidence: number;
  timestamp: string;
  tokensUsed: number;
}

// Chat types
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  documentId?: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

// User types
export interface User {
  id: string;
  email: string;
  name: string;
  photoURL?: string;
  createdAt: string;
  lastLoginAt: string;
  subscription: "free" | "pro" | "enterprise";
}

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T = unknown> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Document processing types
export interface DocumentProcessRequest {
  project_id: string;
  document_id: string;
  storage_path: string;
}

export interface DocumentProcessResponse {
  success: boolean;
  document_id: string;
  chunks_created: number;
  processing_time_ms: number;
  error?: string;
}

export interface ParsedDocumentPage {
  page_number: number;
  text: string;
}

export interface ParsedDocument {
  text: string;
  pages?: ParsedDocumentPage[];
  metadata: {
    fileName: string;
    fileType: string;
    pages?: number;
    size: number;
  };
}

// Vector search types
export interface VectorSearchRequest {
  query: string;
  documentId?: string;
  projectId?: string;
  limit?: number;
  threshold?: number;
}

export interface VectorSearchResult {
  id: string;
  content: string;
  similarity: number;
  metadata: {
    documentId: string;
    projectId: string;
    userId: string;
    pageNumber?: number;
    chunkIndex: number;
    fileName: string;
    fileType: string;
  };
}

// File Library types
export interface FileLibraryItem {
  fileId: string;
  name: string;
  createdAt: string;
  projectId: string;
  projectName: string;
  thumbnail_url?: string;
  storage_path: string;
  imagePaths?: Record<number, string>;
  firstImageUrl?: string | null;
}

export interface ListFilesResponse {
  files: FileLibraryItem[];
  total: number;
  hasMore: boolean;
}
