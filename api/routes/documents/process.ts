import { Context } from "hono";
import type {
  DocumentProcessRequest,
  DocumentProcessResponse,
} from "../../../shared/types/index.ts";
import { supabaseService } from "../../lib/supabaseClient.ts";
import { openaiClient } from "../../lib/openaiClient.ts";
// import { embeddingClient } from "../../lib/embeddingClient.ts"; // Removed - no longer using fallback embeddings
import { type DocumentChunk, qdrantService } from "../../lib/qdrantClient.ts";
import {
  chunkPages,
  createChunkId,
  type PageContent,
} from "../../lib/chunkText.ts";

interface DocParserResponse {
  text: string;
  pages: Array<{
    page_number: number;
    text: string;
  }>;
  meta: {
    fileName: string;
    fileType: string;
    pages?: number;
    size: number;
    extractionMethod?: string;
    textLength?: number;
  };
  error?: string;
}

export async function processDocument(c: Context) {
  const startTime = Date.now();
  let tempFilePath: string | null = null;

  try {
    // Extract and validate request body
    const body = await c.req.json();
    const { project_id, document_id, storage_path }: DocumentProcessRequest =
      body;

    if (!project_id || !document_id || !storage_path) {
      return c.json({
        success: false,
        error: "Missing required fields: project_id, document_id, storage_path",
      } as DocumentProcessResponse, 400);
    }

    // Extract and validate Authorization header
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({
        success: false,
        error: "Missing or invalid Authorization header",
      } as DocumentProcessResponse, 401);
    }

    const token = authHeader.replace("Bearer ", "");

    // Check if this is an admin token (Legacy JWT secret)
    const legacyJwtSecret = Deno.env.get("LEGACY_JWT_SECRET");
    let user: { id: string; email?: string };
    let isAdminMode = false;

    if (legacyJwtSecret && token === legacyJwtSecret) {
      // Admin mode - bypass user auth and get user info directly from document
      console.log("🔑 Admin mode: Using Legacy JWT secret");
      isAdminMode = true;

      // Get document first to find the user_id
      const adminDocument = await supabaseService.getDocumentAsAdmin(
        document_id,
      );
      user = { id: adminDocument.user_id, email: "admin@insightsphere.app" };
      console.log(
        `Processing document ${document_id} for user ${user.id} (admin mode)`,
      );
    } else {
      // Regular user mode - validate JWT token
      user = await supabaseService.getUserFromToken(token);
      console.log(
        `Processing document ${document_id} for user ${user.id} (user mode)`,
      );
    }

    // Validate user has access to the document
    let document;
    if (isAdminMode) {
      // Admin mode - get document without user restriction
      document = await supabaseService.getDocumentAsAdmin(document_id);
    } else {
      // Regular mode - validate user ownership
      document = await supabaseService.getDocument(document_id, user.id);
    }
    console.log(`Document found: ${document.file_name} (${document.status})`);

    // Validate user has access to the project
    if (!isAdminMode) {
      const hasProjectAccess = await supabaseService.validateProjectAccess(
        project_id,
        user.id,
      );
      if (!hasProjectAccess) {
        return c.json({
          success: false,
          error: "Access denied to project",
        } as DocumentProcessResponse, 403);
      }
    } else {
      console.log("🔑 Admin mode: Skipping project access validation");
    }

    // Update document status to processing
    await supabaseService.updateDocument(document_id, { status: "processing" });

    // Download file from Supabase Storage
    console.log(`Downloading file: ${storage_path}`);
    const fileData = await supabaseService.downloadFile(storage_path);

    // Create temporary file for Go parser
    tempFilePath = await supabaseService.createTempFile(
      fileData.data,
      fileData.fileName || "temp_file",
    );

    // Determine file type and call appropriate parser endpoint
    const fileExtension = document.file_name.toLowerCase().split(".").pop();
    let parserEndpoint: string;

    if (fileExtension === "pdf") {
      parserEndpoint = "/parse/pdf";
    } else if (fileExtension === "docx") {
      parserEndpoint = "/parse/docx";
    } else {
      throw new Error(`Unsupported file type: ${fileExtension}`);
    }

    // Call Go document parser
    const parserUrl = Deno.env.get("DOC_PARSER_URL") || "http://localhost:8080";
    console.log(`Sending to parser: ${parserUrl}${parserEndpoint}`);

    const parseResponse = await fetch(`${parserUrl}${parserEndpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filePath: tempFilePath,
      }),
    });

    if (!parseResponse.ok) {
      throw new Error(
        `Parser service failed: ${parseResponse.status} ${parseResponse.statusText}`,
      );
    }

    const parseResult: DocParserResponse = await parseResponse.json();

    if (parseResult.error) {
      throw new Error(`Parser error: ${parseResult.error}`);
    }

    console.log(
      `Parsed document: ${parseResult.text.length} characters, ${
        parseResult.pages?.length || 0
      } pages`,
    );

    // Clean up temporary file
    if (tempFilePath) {
      await supabaseService.cleanupTempFile(tempFilePath);
      tempFilePath = null;
    }

    // Chunk the text with page information
    const pageContents: PageContent[] = parseResult.pages.map((page) => ({
      pageNumber: page.page_number,
      text: page.text,
    }));

    const textChunks = chunkPages(pageContents, {
      maxChunkSize: 800, // Target 800 tokens per chunk
      overlap: 100, // 100 token overlap
      preserveSentences: true,
    });

    console.log(
      `Created ${textChunks.length} text chunks from ${pageContents.length} pages`,
    );

    // Generate embeddings for all chunks
    const chunkTexts = textChunks.map((chunk) => chunk.content);
    let embeddings;
    const embeddingModel = "text-embedding-3-small";
    let totalTokens = 0;

    try {
      // CRITICAL: Use OpenAI embeddings to ensure consistent dimensions
      console.log(
        "🔄 Generating OpenAI embeddings (text-embedding-3-small, 1536 dimensions)...",
      );
      embeddings = await openaiClient.generateBatchEmbeddings(
        chunkTexts,
        "text-embedding-3-small",
      );
      totalTokens = embeddings.reduce(
        (sum, emb) => sum + emb.usage.total_tokens,
        0,
      );
      console.log(
        `✅ Generated ${embeddings.length} OpenAI embeddings (1536 dimensions)`,
      );
    } catch (openaiError) {
      console.error("❌ OpenAI embeddings failed:", openaiError);

      throw new Error(
        `OpenAI embedding generation failed. Cannot fall back to different embedding models ` +
          `as this would create dimension mismatch with query embeddings. ` +
          `Please ensure OpenAI API key is configured correctly. ` +
          `Error: ${
            openaiError instanceof Error ? openaiError.message : "Unknown error"
          }`,
      );
    }
    if (!embeddings) {
      throw new Error("No embeddings generated");
    }
    console.log(
      `Generated ${embeddings.length} embeddings using ${embeddingModel}`,
    );

    // Prepare chunks for Qdrant storage
    const documentChunks: DocumentChunk[] = textChunks.map((chunk, index) => ({
      id: createChunkId(document_id, index, chunk.pageNumber),
      content: chunk.content,
      embedding: embeddings[index].embedding,
      metadata: {
        documentId: document_id,
        projectId: project_id,
        userId: user.id,
        pageNumber: chunk.pageNumber,
        chunkIndex: index,
        fileName: document.file_name,
        fileType: fileExtension || "unknown",
        createdAt: new Date().toISOString(),
      },
    }));

    // Store chunks in Qdrant (per-project collection)
    await qdrantService.upsertChunks(documentChunks, {
      useProjectCollection: true,
    });

    console.log(`Stored ${documentChunks.length} chunks in Qdrant`);

    // Update document metadata and status
    const updatedMetadata = {
      ...(document.metadata || {}),
      textLength: parseResult.text.length,
      chunkCount: textChunks.length,
      pages: parseResult.pages?.length || 0,
      embeddingModel: embeddingModel,
      processedAt: new Date().toISOString(),
      tokensUsed: totalTokens,
      extractionMethod: parseResult.meta?.extractionMethod || "ocr",
    };

    await supabaseService.updateDocument(document_id, {
      status: "ready",
      metadata: updatedMetadata,
    });

    const processingTime = Date.now() - startTime;
    console.log(`Document processing completed in ${processingTime}ms`);

    return c.json({
      success: true,
      document_id,
      chunks_created: textChunks.length,
      processing_time_ms: processingTime,
    } as DocumentProcessResponse);
  } catch (error) {
    console.error("Document processing failed:", error);

    // Clean up temporary file if it exists
    if (tempFilePath) {
      try {
        await supabaseService.cleanupTempFile(tempFilePath);
      } catch (cleanupError) {
        console.warn("Failed to cleanup temp file:", cleanupError);
      }
    }

    // Update document status to failed if we have the document_id
    try {
      const body = await c.req.json();
      const { document_id } = body;
      if (document_id) {
        await supabaseService.updateDocument(document_id, { status: "failed" });
      }
    } catch {
      // Ignore errors in error handler
    }

    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error
      ? error.message
      : "Unknown error occurred";

    return c.json({
      success: false,
      document_id: "",
      chunks_created: 0,
      processing_time_ms: processingTime,
      error: errorMessage,
    } as DocumentProcessResponse, 500);
  }
}
