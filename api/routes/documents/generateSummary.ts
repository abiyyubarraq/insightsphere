import { Context } from "hono";
import {
  DocumentProcessRequest,
  DocumentProcessResponse,
} from "../../../shared/types/index.ts";
import { supabaseService } from "../../lib/supabaseClient.ts";
import { ChatCompletionRequest, openaiClient } from "../../lib/openaiClient.ts";

export async function generateSummary(c: Context) {
  const startTime = Date.now();
  let tempFilePath: string | null = null;
  let uploadResponseId: string | null = null;
  try {
    // Extract and validate request body
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

    console.log(`Downloading file: ${storage_path}`);
    const fileData = await supabaseService.downloadFile(storage_path);
    console.log(
      `File downloaded: ${fileData.fileName}, size: ${fileData.data.length} bytes`
    );

    tempFilePath = await supabaseService.createTempFile(
      fileData.data,
      fileData.fileName || "temp_file"
    );
    console.log(`Temp file created: ${tempFilePath}`);

    // Verify the file exists before uploading
    try {
      const fileInfo = await Deno.stat(tempFilePath);
      console.log(
        `File verified: ${tempFilePath}, size: ${fileInfo.size} bytes`
      );
    } catch (statError) {
      throw new Error(
        `Temp file verification failed: ${
          statError instanceof Error ? statError.message : "Unknown error"
        }`
      );
    }

    try {
      console.log(`Uploading file to OpenAI: ${tempFilePath}`);
      uploadResponseId = await openaiClient.uploadFile(tempFilePath);
      console.log(`File uploaded to OpenAI with ID: ${uploadResponseId}`);
      const request: ChatCompletionRequest = {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are InsightSphere, an intelligent document analysis and summarization assistant.

## Core Instructions:
1. **Read and analyze** the uploaded file thoroughly and comprehensively
2. **Generate a structured summary** that captures the document's essence, key insights, and main takeaways
3. **Preserve technical accuracy** and maintain important terminology from the original document
4. **Base your analysis solely** on the uploaded file content - do not add external knowledge
5. **Format your response** in clean, readable Markdown with proper structure

## Required Output Structure:
### 📄 Document Overview
- **Title:** [Extract or infer the document title]
- **Type:** [Identify document type: report, research paper, manual, etc.]
- **Purpose:** [Brief description of the document's main purpose]

### 📋 Executive Summary
[2-3 paragraph comprehensive summary covering the main content and findings]

### 🔑 Key Points
- [Bullet point 1: Main finding or argument]
- [Bullet point 2: Important insight or conclusion]
- [Bullet point 3: Critical information or recommendation]
- [Continue as needed for all major points]

### 📊 Important Details
[Include specific data, statistics, dates, names, or technical details that are crucial]

### 🎯 Key Takeaways
[3-5 bullet points highlighting the most important insights for someone who needs to understand this document quickly]

### 💡 Notable Terms & Concepts
[Important keywords, technical terms, or concepts that someone should know when working with this document]

**Note:** Ensure your summary is comprehensive yet concise, maintaining the document's original meaning while making it accessible to readers who need to quickly understand the content.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Please provide a comprehensive analysis and summary of the uploaded document. Focus on extracting the most important information, key insights, and actionable takeaways while maintaining accuracy to the original content.",
              },
              {
                type: "file",
                file: { file_id: uploadResponseId },
              },
            ],
          },
        ],
        max_tokens: 3000,
        temperature: 0.1,
        top_p: 0.95,
      };
      const result = await openaiClient.generateChatCompletion(request);
      await supabaseService.updateDocument(document_id, {
        summary: result.answer,
        is_summary_exist: true,
      });
      if (uploadResponseId) {
        await openaiClient.deleteFile(uploadResponseId);
        uploadResponseId = null;
      }
      if (tempFilePath) {
        await supabaseService.cleanupTempFile(tempFilePath);
        tempFilePath = null;
      }
    } catch (openaiError) {
      console.error("❌ OpenAI summary generation failed:", openaiError);

      throw new Error(
        `OpenAI summary generation failed. ` +
          `Please ensure OpenAI API key is configured correctly. ` +
          `Error: ${
            openaiError instanceof Error ? openaiError.message : "Unknown error"
          }`
      );
    }

    const processingTime = Date.now() - startTime;
    return c.json(
      {
        success: true,
        document_id: document_id,
        processing_time_ms: processingTime,
      },
      200
    );
  } catch (error) {
    console.error("Document processing failed:", error);

    // Clean up temporary file if it exists
    if (tempFilePath) {
      try {
        await supabaseService.cleanupTempFile(tempFilePath);
        tempFilePath = null;
      } catch (cleanupError) {
        console.warn("Failed to cleanup temp file:", cleanupError);
      }
    }
    if (uploadResponseId) {
      try {
        await openaiClient.deleteFile(uploadResponseId);
        uploadResponseId = null;
      } catch (deleteError) {
        console.warn("Failed to delete file:", deleteError);
      }
    }

    // Update document status to failed if we have the document_id
    try {
      const body = await c.req.json();
      const { document_id } = body;
      if (document_id) {
        await supabaseService.updateDocument(document_id, { summary: null });
      }
    } catch (updateError) {
      console.warn(
        "Failed to update document status in error handler:",
        updateError
      );
      // Ignore errors in error handler
    }

    const processingTime = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return c.json(
      {
        success: false,
        document_id: "",
        processing_time_ms: processingTime,
        error: errorMessage,
      },
      500
    );
  }
}
