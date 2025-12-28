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
  pages: Array<{
    page_number: number;
    text: string;
    image_path?: string;
  }>;
  meta: {
    fileName: string;
    fileType: string;
    pages?: number;
    size: number;
    extractionMethod?: string;
    textLength?: number;
  };
  imagePaths?: Record<number, string>; // page_number -> temp file path
  imagesDir?: string; // temp directory for cleanup
  error?: string;
}

export async function processDocument(c: Context) {
  const startTime = Date.now();
  let tempFilePath: string | null = null;

  try {
    const body = await c.req.json();
    const { project_id, document_id, storage_path }: DocumentProcessRequest =
      body;

    if (!project_id || !document_id || !storage_path) {
      return c.json(
        {
          success: false,
          error:
            "Missing required fields: project_id, document_id, storage_path",
        } as DocumentProcessResponse,
        400
      );
    }

    // Extract and validate Authorization header
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json(
        {
          success: false,
          error: "Missing or invalid Authorization header",
        } as DocumentProcessResponse,
        401
      );
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
        document_id
      );
      user = { id: adminDocument.user_id, email: "admin@insightsphere.app" };
      console.log(
        `Processing document ${document_id} for user ${user.id} (admin mode)`
      );
    } else {
      // Regular user mode - validate JWT token
      user = await supabaseService.getUserFromToken(token);
      console.log(
        `Processing document ${document_id} for user ${user.id} (user mode)`
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
        user.id
      );
      if (!hasProjectAccess) {
        return c.json(
          {
            success: false,
            error: "Access denied to project",
          } as DocumentProcessResponse,
          403
        );
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
      fileData.fileName || "temp_file"
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
        `Parser service failed: ${parseResponse.status} ${parseResponse.statusText}`
      );
    }

    const parseResult: DocParserResponse = await parseResponse.json();

    if (parseResult.error) {
      throw new Error(`Parser error: ${parseResult.error}`);
    }

    console.log(
      `Parsed document: ${parseResult.meta?.textLength || 0} characters, ${
        parseResult.pages?.length || 0
      } pages`
    );

    const imagePaths: Record<number, string> = {};
    if (
      parseResult.imagePaths &&
      Object.keys(parseResult.imagePaths).length > 0
    ) {
      console.log(
        `📸 Uploading ${
          Object.keys(parseResult.imagePaths).length
        } page images to Supabase Storage...`
      );

      for (const [pageNumStr, tempPath] of Object.entries(
        parseResult.imagePaths
      )) {
        const pageNum = parseInt(pageNumStr, 10);
        try {
          console.log(`  📖 Reading PNG from: ${tempPath}`);
          const imageData = await Deno.readFile(tempPath);
          console.log(`  📦 Read ${imageData.length} bytes`);
          const storagePath = `${user.id}/${project_id}/images/${document_id}/page-${pageNum}.png`;
          const uploadedPath = await supabaseService.uploadFile(
            imageData,
            storagePath,
            "image/png"
          );
          imagePaths[pageNum] = uploadedPath;
          console.log(`  ✅ Page ${pageNum} PNG uploaded to: ${uploadedPath}`);
        } catch (uploadError) {
          console.error(
            `  ❌ Failed to upload page ${pageNum} image:`,
            uploadError
          );
        }
      }

      // Cleanup temp image directory
      if (parseResult.imagesDir) {
        try {
          await Deno.remove(parseResult.imagesDir, { recursive: true });
          console.log(`🧹 Cleaned up temp images: ${parseResult.imagesDir}`);
        } catch {
          console.warn(
            `⚠️ Failed to clean temp images directory: ${parseResult.imagesDir}`
          );
        }
      }
    }

    try {
      console.log(
        `💾 Persisting ${parseResult.pages.length} pages to database...`
      );
      await supabaseService.storeDocumentPages(
        document_id,
        parseResult.pages,
        imagePaths
      );
      console.log(
        `✅ Stored ${parseResult.pages.length} pages in document_pages table`
      );
    } catch (pageStoreError) {
      console.error("⚠️ Failed to store document pages:", pageStoreError);
      console.warn(
        "⚠️ Continuing with processing despite page storage failure"
      );
    }

    const parseMetadata = {
      pageCount: parseResult.pages?.length || 0,
      extractionMethod: parseResult.meta?.extractionMethod || "ocr",
    };

    const embeddingModel = "text-embedding-3-small";
    let totalTokens = 0;
    let totalChunksStored = 0;
    let globalChunkIndex = 0;

    const totalPages = parseResult.pages.length;

    // @ts-ignore - intentionally clearing for memory
    parseResult.text = "";

    console.log(
      `📦 Processing ${totalPages} pages one at a time (memory-optimized)...`
    );

    let pageNumber = 0;
    while (parseResult.pages.length > 0) {
      pageNumber++;

      console.log(`\n🔄 Processing page ${pageNumber}/${totalPages}...`);

      const currentPage = parseResult.pages.shift()!;

      const batchPages = [currentPage];

      // Step 1: Create page contents for this batch
      const pageContents: PageContent[] = [
        {
          pageNumber: batchPages[0].page_number,
          text: batchPages[0].text,
        },
      ];

      // Step 2: Chunk the batch pages (memory-optimized settings)
      const textChunks = chunkPages(pageContents, {
        maxChunkSize: 800,
        overlap: 50, // Reduced from 100 for less memory
        preserveSentences: false, // Character-based chunking is more memory efficient
      });

      console.log(
        `  📝 Created ${textChunks.length} chunks from ${batchPages.length} pages`
      );

      pageContents.length = 0;

      // Step 3: Generate embeddings for this batch
      let embeddings;
      try {
        embeddings = await openaiClient.generateBatchEmbeddings(
          textChunks.map((chunk) => chunk.content),
          "text-embedding-3-small"
        );
        totalTokens += embeddings.reduce(
          (sum, emb) => sum + emb.usage.total_tokens,
          0
        );
        console.log(`  🧠 Generated ${embeddings.length} embeddings`);
      } catch (openaiError) {
        console.error("❌ OpenAI embeddings failed:", openaiError);
        throw new Error(
          `OpenAI embedding generation failed for page ${pageNumber}. ` +
            `Error: ${
              openaiError instanceof Error
                ? openaiError.message
                : "Unknown error"
            }`
        );
      }

      // Step 4: Prepare document chunks for Qdrant
      const documentChunks: DocumentChunk[] = textChunks.map(
        (chunk, index) => ({
          id: createChunkId(
            document_id,
            globalChunkIndex + index,
            chunk.pageNumber
          ),
          content: chunk.content,
          embedding: embeddings[index].embedding,
          metadata: {
            documentId: document_id,
            projectId: project_id,
            userId: user.id,
            pageNumber: chunk.pageNumber,
            chunkIndex: globalChunkIndex + index,
            fileName: document.file_name,
            fileType: fileExtension || "unknown",
            createdAt: new Date().toISOString(),
            embeddingModel: embeddingModel,
          },
        })
      );

      globalChunkIndex += textChunks.length;

      textChunks.length = 0;
      embeddings.length = 0;

      // Step 5: Store this batch in Qdrant
      await qdrantService.upsertChunks(documentChunks, {
        useProjectCollection: true,
      });

      totalChunksStored += documentChunks.length;
      console.log(`  💾 Stored ${documentChunks.length} chunks in Qdrant`);

      documentChunks.length = 0;

      // Hint to GC after each batch (--expose-gc required)
      // deno-lint-ignore no-explicit-any
      if (typeof (globalThis as any).gc === "function") {
        // deno-lint-ignore no-explicit-any
        (globalThis as any).gc();
      }

      // Small delay between pages to allow GC
      if (parseResult.pages.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    const storedChunkCount = totalChunksStored;
    console.log(
      `\n✅ Batch processing complete: ${storedChunkCount} chunks stored from ${totalPages} pages`
    );

    // Clean up temporary file
    if (tempFilePath) {
      await supabaseService.cleanupTempFile(tempFilePath);
      tempFilePath = null;
    }

    // Update document metadata and status
    const updatedMetadata = {
      ...(document.metadata || {}),
      chunkCount: storedChunkCount,
      pages: parseMetadata.pageCount,
      embeddingModel: embeddingModel,
      processedAt: new Date().toISOString(),
      tokensUsed: totalTokens,
      extractionMethod: parseMetadata.extractionMethod,
    };

    await supabaseService.updateDocument(document_id, {
      status: "ready",
      metadata: updatedMetadata,
      image_paths: imagePaths,
    });

    const processingTime = Date.now() - startTime;
    console.log(`Document processing completed in ${processingTime}ms`);

    return c.json({
      success: true,
      document_id,
      chunks_created: storedChunkCount,
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
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return c.json(
      {
        success: false,
        document_id: "",
        chunks_created: 0,
        processing_time_ms: processingTime,
        error: errorMessage,
      } as DocumentProcessResponse,
      500
    );
  }
}
