import type { Context } from "hono";
import { qdrantService } from "../../lib/qdrantClient.ts";
import { keyFailureResponse } from "../../lib/openaiErrors.ts";
import { openAIForUser } from "../../lib/userOpenAI.ts";
import { supabaseService } from "../../lib/supabaseClient.ts";
import { SEARCH_DEFAULTS } from "../../lib/constants.ts";
import { currentUser } from "../../lib/auth.ts";
import { errorInfo } from "../../lib/logSafe.ts";

interface SearchRequest {
  query: string;
  project_id: string;
  limit?: number;
  threshold?: number;
}

interface SearchResult {
  id: string;
  content: string;
  score: number;
  metadata: {
    documentId: string;
    pageNumber?: number;
    chunkIndex: number;
    fileName: string;
    fileType: string;
    createdAt: string;
  };
}

export async function searchDocuments(c: Context) {
  try {
    const startTime = Date.now();

    // Parse request body
    const body = await c.req.json() as SearchRequest;
    const { query, project_id, limit = 10, threshold = SEARCH_DEFAULTS.threshold } = body;

    if (!query?.trim()) {
      return c.json({ error: "Query is required" }, 400);
    }

    if (!project_id?.trim()) {
      return c.json({ error: "Project ID is required" }, 400);
    }

    console.log(`🔍 Searching in project: ${project_id}, query length: ${query.length}`);

    const user = currentUser(c);

    const hasAccess = await supabaseService.userHasProjectAccess(
      user.id,
      project_id,
    );
    if (!hasAccess) {
      return c.json({ error: "Access denied to this project" }, 403);
    }

    // Must match the model documents were indexed with. A fallback to a
    // different provider would change the dimensionality and silently return
    // nothing, so failure is surfaced instead.
    const embeddingModel = "text-embedding-3-small";
    const openai = await openAIForUser(user.id);
    let queryEmbedding: number[];
    try {
      const embedding = await openai.client.generateEmbedding({
        text: query,
        model: embeddingModel,
      });
      queryEmbedding = embedding.embedding;
    } catch (error) {
      console.error("Query embedding failed:", { project_id, ...errorInfo(error) });
      const keyFailure = keyFailureResponse(c, openai.own, error);
      if (keyFailure) return keyFailure;
      return c.json({
        error: "Could not process the query",
      }, 502);
    }

    // Search in the project-specific collection
    const searchResults = await qdrantService.searchSimilar(queryEmbedding, {
      userId: user.id,
      projectId: project_id,
      useProjectCollection: true, // Use per-project collection
      limit,
      threshold,
    });

    console.log(
      `🎯 Found ${searchResults.length} relevant chunks in project ${project_id}`,
    );

    // Format results
    const formattedResults: SearchResult[] = searchResults.map((result) => ({
      id: result.id,
      content: result.content,
      score: result.score,
      metadata: {
        documentId: result.metadata.documentId,
        pageNumber: result.metadata.pageNumber,
        chunkIndex: result.metadata.chunkIndex,
        fileName: result.metadata.fileName,
        fileType: result.metadata.fileType,
        createdAt: result.metadata.createdAt,
      },
    }));

    const processingTime = Date.now() - startTime;

    return c.json({
      success: true,
      query,
      project_id,
      results: formattedResults,
      metadata: {
        total_results: formattedResults.length,
        embedding_model: embeddingModel,
        processing_time_ms: processingTime,
        threshold_used: threshold,
        collection_strategy: "per-project",
      },
    });
  } catch (error) {
    console.error("Search failed:", errorInfo(error));
    return c.json({
      error: "Search failed",
    }, 500);
  }
}
