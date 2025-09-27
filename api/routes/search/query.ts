import type { Context } from "hono";
import { qdrantService } from "../../lib/qdrantClient.ts";
import { embeddingClient } from "../../lib/embeddingClient.ts";
import { openaiClient } from "../../lib/openaiClient.ts";
import { supabaseService } from "../../lib/supabaseClient.ts";

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
    const { query, project_id, limit = 10, threshold = 0.7 } = body;

    if (!query?.trim()) {
      return c.json({ error: "Query is required" }, 400);
    }

    if (!project_id?.trim()) {
      return c.json({ error: "Project ID is required" }, 400);
    }

    console.log(`🔍 Searching in project: ${project_id} for query: "${query}"`);

    // Get user from token (or use admin mode)
    const legacySecret = Deno.env.get("LEGACY_JWT_SECRET");
    const authHeader = c.req.header("Authorization");

    let user;
    if (authHeader?.startsWith(`Bearer ${legacySecret}`)) {
      console.log("🔑 Admin mode: Searching across all projects");
      // In admin mode, we'll need a way to determine the user
      // For now, let's extract it from a header or query param
      const adminUserId = c.req.header("X-Admin-User-Id");
      if (!adminUserId) {
        return c.json(
          { error: "Admin mode requires X-Admin-User-Id header" },
          400,
        );
      }
      user = { id: adminUserId };
    } else {
      // Normal user authentication
      user = await supabaseService.getUserFromToken(
        authHeader?.replace("Bearer ", "") || "",
      );
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Verify user has access to this project
      const hasAccess = await supabaseService.userHasProjectAccess(
        user.id,
        project_id,
      );
      if (!hasAccess) {
        return c.json({ error: "Access denied to this project" }, 403);
      }
    }

    // Generate embedding for the query
    let queryEmbedding: number[] = [];
    let embeddingModel = "text-embedding-3-small";

    try {
      console.log("🤖 Generating OpenAI embedding for query...");
      const embedding = await openaiClient.generateEmbedding({ text: query });
      queryEmbedding = embedding.embedding;
      console.log(
        `✅ Generated OpenAI embedding (${queryEmbedding.length} dimensions)`,
      );
    } catch (_error) {
      console.log("⚠️ OpenAI failed, trying Hugging Face...");
      try {
        const embedding = await embeddingClient.generateHuggingFaceEmbedding(
          query,
        );
        queryEmbedding = embedding.embedding;
        embeddingModel = embedding.model;
        console.log(
          `✅ Generated ${embeddingModel} embedding (${queryEmbedding.length} dimensions)`,
        );
      } catch (_hfError) {
        console.log("⚠️ Hugging Face failed: " + _hfError);
      }
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
    console.error("Search failed:", error);
    return c.json({
      error: "Search failed",
      details: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
}
