/**
 * RAG Query Endpoint
 * POST /v1/projects/:projectId/query
 */

import type { Context } from "hono";
import { type RAGQueryOptions, ragService } from "../../lib/ragService.ts";
import { supabaseService } from "../../lib/supabaseClient.ts";

interface QueryRequest {
  query: string;
  options?: RAGQueryOptions;
}

interface QueryResponse {
  success: boolean;
  answer: string;
  citations: Array<{
    document_id: string;
    file_name: string;
    page_number?: number;
    chunk_index: number;
    similarity_score: number;
    text_snippet: string;
  }>;
  metadata: {
    query: string;
    project_id: string;
    chunks_retrieved: number;
    chunks_used: number;
    avg_similarity: number;
    embedding_model: string;
    llm_model: string;
    processing_time_ms: number;
    context_length: number;
  };
}

export async function queryProject(c: Context) {
  try {
    const startTime = Date.now();

    // Extract project ID from URL parameters
    const projectId = c.req.param("projectId");
    if (!projectId) {
      return c.json({
        success: false,
        error: "Project ID is required",
      }, 400);
    }

    // Parse request body
    const body = await c.req.json() as QueryRequest;
    const { query, options = {} } = body;

    if (!query?.trim()) {
      return c.json({
        success: false,
        error: "Query is required",
      }, 400);
    }

    console.log(
      `🔍 RAG Query Request - Project: ${projectId}, Query: "${query}"`,
    );

    // Get user from token (or use admin mode)
    const legacySecret = Deno.env.get("LEGACY_JWT_SECRET");
    const authHeader = c.req.header("Authorization");

    let user;
    if (authHeader?.startsWith(`Bearer ${legacySecret}`)) {
      console.log("🔑 Admin mode: RAG query with legacy JWT");
      // In admin mode, we'll need a way to determine the user
      const adminUserId = c.req.header("X-Admin-User-Id");
      if (!adminUserId) {
        return c.json({
          success: false,
          error: "Admin mode requires X-Admin-User-Id header",
        }, 400);
      }
      user = { id: adminUserId };
    } else {
      // Normal user authentication
      user = await supabaseService.getUserFromToken(
        authHeader?.replace("Bearer ", "") || "",
      );
      if (!user) {
        return c.json({
          success: false,
          error: "Unauthorized",
        }, 401);
      }

      // Verify user has access to this project
      const hasAccess = await supabaseService.userHasProjectAccess(
        user.id,
        projectId,
      );
      if (!hasAccess) {
        return c.json({
          success: false,
          error: "Access denied to this project",
        }, 403);
      }
    }

    console.log(`👤 User: ${user.id} querying project: ${projectId}`);

    // Set default options
    const queryOptions: RAGQueryOptions = {
      max_chunks: 5,
      similarity_threshold: 0.6,
      use_short_context: false,
      max_context_length: 4000,
      ...options,
    };

    console.log(`⚙️ Query options:`, queryOptions);

    // Execute RAG query
    const ragResult = await ragService.queryProject(
      projectId,
      user.id,
      query,
      queryOptions,
    );

    const totalTime = Date.now() - startTime;
    console.log(`✅ RAG query completed in ${totalTime}ms`);

    // Format response
    const response: QueryResponse = {
      success: true,
      answer: ragResult.answer,
      citations: ragResult.citations.map((citation) => ({
        document_id: citation.document_id,
        file_name: citation.file_name,
        page_number: citation.page_number,
        chunk_index: citation.chunk_index,
        similarity_score: citation.similarity_score,
        text_snippet: citation.text_snippet,
      })),
      metadata: {
        ...ragResult.metadata,
        processing_time_ms: totalTime, // Override with total endpoint time
      },
    };

    return c.json(response);
  } catch (error) {
    console.error("RAG query endpoint failed:", error);

    return c.json({
      success: false,
      error: "Query processing failed",
      details: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
}

/**
 * Get query suggestions based on project content
 * GET /v1/projects/:projectId/query/suggestions
 */
export function getQuerySuggestions(c: Context) {
  try {
    const projectId = c.req.param("projectId");
    if (!projectId) {
      return c.json({
        success: false,
        error: "Project ID is required",
      }, 400);
    }

    // For now, return static suggestions
    // TODO: Generate dynamic suggestions based on document content
    const suggestions = [
      "What are the main topics covered in these documents?",
      "Can you summarize the key findings?",
      "What methodology was used?",
      "What are the conclusions and recommendations?",
      "Are there any important statistics or data points?",
      "What are the main challenges or limitations mentioned?",
      "Who are the key authors or contributors?",
      "What future research directions are suggested?",
    ];

    return c.json({
      success: true,
      project_id: projectId,
      suggestions,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Query suggestions failed:", error);

    return c.json({
      success: false,
      error: "Failed to get query suggestions",
      details: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
}
