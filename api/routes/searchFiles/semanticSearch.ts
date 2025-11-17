import {
  FileLibraryItem,
  ListFilesResponse,
} from "../../../shared/types/index.ts";
import { FileQueryResult, ListFilesRequest } from "./search.ts";
import { qdrantService } from "../../lib/qdrantClient.ts";
import { openaiClient } from "../../lib/openaiClient.ts";
import { supabaseService } from "../../lib/supabaseClient.ts";
import { formatFileData } from "./helpers.ts";

/**
 * Handle semantic search mode
 */
export async function handleSemanticSearch(
  userId: string,
  request: ListFilesRequest
): Promise<ListFilesResponse> {
  const {
    limit = 100,
    offset = 0,
    searchQuery,
    projectIds: projectIdsParam,
  } = request;

  let projectIds = projectIdsParam;

  if (!searchQuery?.trim()) {
    throw new Error("Search query is required for semantic search");
  }

  if (!projectIds || projectIds.length === 0) {
    // fetch all projects for the user
    const { data, error } = await supabaseService
      .getClient()
      .from("projects")
      .select("id")
      .eq("user_id", userId);
    if (error) {
      console.error("Error fetching projects:", error);
      throw new Error("Failed to fetch projects");
    }
    projectIds = data?.map((project) => project.id) || [];
  }

  // Generate embedding for semantic search
  let queryEmbedding: number[] = [];
  try {
    console.log("🤖 Generating embedding for semantic search...");
    const embedding = await openaiClient.generateEmbedding({
      text: searchQuery,
    });
    queryEmbedding = embedding.embedding;
  } catch (_error) {
    console.error("Failed to generate embedding");
    throw new Error("Failed to generate embedding for semantic search");
  }

  // Search across selected projects
  const allFiles: FileLibraryItem[] = [];
  for (const projectId of projectIds) {
    // Verify user has access to this project
    const hasAccess = await supabaseService.userHasProjectAccess(
      userId,
      projectId
    );
    if (!hasAccess) {
      console.log(
        `⚠️ User ${userId} does not have access to project ${projectId}`
      );
      continue;
    }

    // Check if collection exists for this user and project
    try {
      await qdrantService.getCollectionInfo(userId, projectId);
    } catch (_error) {
      console.log(
        `⚠️ Collection for user ${userId} and project ${projectId} does not exist, skipping...`
      );
      continue;
    }

    // Search Qdrant for relevant documents
    const searchResults = await qdrantService.searchSimilar(queryEmbedding, {
      userId,
      projectId,
      useProjectCollection: true,
      limit: 50, // Get more chunks to find unique documents
      threshold: 0.25,
    });

    // Extract unique document IDs
    const documentIds = new Set<string>();
    for (const result of searchResults) {
      documentIds.add(result.metadata.documentId);
    }

    // Fetch file records for these documents
    if (documentIds.size > 0) {
      const { data, error } = await supabaseService
        .getClient()
        .from("project_files")
        .select(
          "id, file_name, created_at, project_id, storage_path, projects(name)"
        )
        .eq("user_id", userId)
        .eq("project_id", projectId)
        .in("id", Array.from(documentIds))
        .order("created_at", { ascending: false })
        .limit(limit)
        .range(offset, offset + limit - 1);

      if (!error && data) {
        for (const file of data as unknown as FileQueryResult[]) {
          allFiles.push(formatFileData(file));
        }
      }
    }
  }

  // Remove duplicates and limit results
  const uniqueFiles = Array.from(
    new Map(allFiles.map((f) => [f.fileId, f])).values()
  ).slice(0, limit);

  return {
    files: uniqueFiles,
    total: uniqueFiles.length,
    hasMore: uniqueFiles.length >= limit,
  };
}
