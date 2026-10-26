/**
 * RAG Query Endpoint
 * POST /v1/projects/:projectId/query
 */

import type { Context } from "hono";
import { type RAGQueryOptions, ragService } from "../../lib/ragService.ts";
import { supabaseService } from "../../lib/supabaseClient.ts";
import { SEARCH_DEFAULTS } from "../../lib/constants.ts";
import { currentUser } from "../../lib/auth.ts";
import {
  chargeUserQuota,
  quotaExceeded,
  QuotaUnavailableError,
  quotaUnavailable,
} from "../../lib/quotaService.ts";
import { keyFailureResponse } from "../../lib/openaiErrors.ts";
import { openAIForUser } from "../../lib/userOpenAI.ts";
import {
  createSuggestionCache,
  getSuggestions,
  SUGGESTION_MAX_TOKENS,
  SUGGESTION_MODEL,
  SUGGESTION_TEMPERATURE,
} from "../../lib/suggestions.ts";

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
  let own = false;
  try {
    const startTime = Date.now();
    const user = currentUser(c);

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

    const hasAccess = await supabaseService.userHasProjectAccess(
      user.id,
      projectId,
    );
    if (!hasAccess) {
      return c.json(
        { success: false, error: "Access denied to this project" },
        403,
      );
    }

    const openai = await openAIForUser(user.id);
    own = openai.own;

    // The same answer as a chat message at the same cost, so it draws on the
    // same budget. Otherwise this route is a way around the chat limit.
    const quota = await chargeUserQuota({ own, userId: user.id, kind: "chat" });
    if (!quota.allowed) return quotaExceeded(c, "chat", quota.limit);

    console.log(`👤 User: ${user.id} querying project: ${projectId}`);

    // Set default options
    const queryOptions: RAGQueryOptions = {
      max_chunks: SEARCH_DEFAULTS.maxChunks,
      similarity_threshold: SEARCH_DEFAULTS.threshold,
      use_short_context: false,
      max_context_length: SEARCH_DEFAULTS.maxContextLength,
      ...options,
    };

    console.log(`⚙️ Query options:`, queryOptions);

    // Execute RAG query
    const ragResult = await ragService.queryProject(
      projectId,
      user.id,
      query,
      openai,
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
    if (error instanceof QuotaUnavailableError) {
      console.error(error.message);
      return quotaUnavailable(c);
    }
    console.error("RAG query endpoint failed:", error);
    const keyFailure = keyFailureResponse(c, own, error);
    if (keyFailure) return keyFailure;

    return c.json({
      success: false,
      error: "Query processing failed",
      details: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
}

/** One per API process; it starts empty after every deploy. */
const suggestionCache = createSuggestionCache();

/**
 * Example questions written from the project's ready documents
 * GET /v1/projects/:projectId/query/suggestions
 *
 * Takes no daily quota, only the burst limit: the cache makes it about one
 * cheap call per document change.
 */
export async function getQuerySuggestions(c: Context) {
  try {
    const user = currentUser(c);
    const projectId = c.req.param("projectId");
    if (!projectId) {
      return c.json({
        success: false,
        error: "Project ID is required",
      }, 400);
    }

    const hasAccess = await supabaseService.userHasProjectAccess(
      user.id,
      projectId,
    );
    if (!hasAccess) {
      return c.json(
        { success: false, error: "Access denied to this project" },
        403,
      );
    }

    const docs = await supabaseService.getReadyDocuments(projectId);
    const { suggestions, source } = await getSuggestions(
      projectId,
      docs,
      // The key is looked up only when a model call is really needed. With a
      // saved key a failure gives the fallback list, never a retry on the
      // server key.
      async (messages, signal) => {
        const openai = await openAIForUser(user.id);
        const result = await openai.client.generateChatCompletion({
          model: SUGGESTION_MODEL,
          messages,
          max_tokens: SUGGESTION_MAX_TOKENS,
          temperature: SUGGESTION_TEMPERATURE,
          signal,
        });
        return result.answer;
      },
      suggestionCache,
    );

    console.log("Query suggestions:", {
      projectId,
      readyDocuments: docs.length,
      count: suggestions.length,
      source,
    });

    return c.json({
      success: true,
      project_id: projectId,
      suggestions,
      source,
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
