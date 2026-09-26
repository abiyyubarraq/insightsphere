import { Context } from "hono";
import {
  DocumentProcessRequest,
  DocumentProcessResponse,
} from "../../../shared/types/index.ts";
import { supabaseService } from "../../lib/supabaseClient.ts";
import { ChatCompletionRequest, openaiClient } from "../../lib/openaiClient.ts";
import { MAX_FILE_BYTES } from "../../lib/constants.ts";
import { currentUser } from "../../lib/auth.ts";
import {
  consumeQuota,
  quotaExceeded,
  QuotaUnavailableError,
  quotaUnavailable,
} from "../../lib/quotaService.ts";

export async function generateSummary(c: Context) {
  const startTime = Date.now();
  let tempFilePath: string | null = null;
  let uploadResponseId: string | null = null;
  try {
    const user = currentUser(c);
    const body = await c.req.json();
    const { project_id, document_id }: DocumentProcessRequest = body;
    const regenerate = body.regenerate === true;

    if (!project_id || !document_id) {
      return c.json(
        {
          success: false,
          error: "Missing required fields: project_id, document_id",
        } as DocumentProcessResponse,
        400,
      );
    }

    // Throws if the document is missing or not owned by this user.
    const document = await supabaseService.getDocument(document_id, user.id);

    const hasProjectAccess = await supabaseService.validateProjectAccess(
      project_id,
      user.id,
    );
    if (!hasProjectAccess) {
      return c.json(
        {
          success: false,
          error: "Access denied to project",
        } as DocumentProcessResponse,
        403,
      );
    }

    // Each call is a full read of the file by the model, the most expensive
    // single request in the app, so an existing summary is not redone by
    // accident.
    if (document.is_summary_exist && !regenerate) {
      return c.json(
        {
          success: false,
          error: "This document already has a summary.",
        } as DocumentProcessResponse,
        409,
      );
    }

    // Charged before the download, so a caller over the limit cannot make the
    // API pull a large file again and again. The size check below then costs a
    // credit, but only a caller who skipped the browser's own check reaches it.
    const quota = await consumeQuota(user.id, "summaries");
    if (!quota.allowed) return quotaExceeded(c, "summaries", quota.limit);

    console.log(`Downloading file: ${document.storage_path}`);
    const fileData = await supabaseService.downloadFile(document.storage_path);
    console.log(
      `File downloaded: ${fileData.fileName}, size: ${fileData.data.length} bytes`
    );

    if (fileData.data.length > MAX_FILE_BYTES) {
      return c.json(
        {
          success: false,
          error: `File is ${(fileData.data.length / 1024 / 1024).toFixed(1)}MB, ` +
            `over the ${MAX_FILE_BYTES / 1024 / 1024}MB limit`,
        } as DocumentProcessResponse,
        413,
      );
    }

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
    if (error instanceof QuotaUnavailableError) {
      console.error(error.message);
      return quotaUnavailable(c);
    }
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
