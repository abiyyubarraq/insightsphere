import {
  FileLibraryItem,
  ListFilesResponse,
} from "../../../shared/types/index.ts";
import { supabaseService } from "../../lib/supabaseClient.ts";
import { buildBaseQuery, formatFileData } from "./helpers.ts";
import { getFileCount } from "./helpers.ts";
import { FileQueryResult, ListFilesRequest } from "./search.ts";

/**
 * Handle filename search mode
 */
export async function handleFilenameSearch(
  userId: string,
  request: ListFilesRequest
): Promise<ListFilesResponse> {
  const { limit = 100, offset = 0, searchQuery, projectIds } = request;

  // Validate project access
  if (projectIds && projectIds.length > 0) {
    for (const projectId of projectIds) {
      const hasAccess = await supabaseService.userHasProjectAccess(
        userId,
        projectId
      );
      if (!hasAccess) {
        throw new Error(`Access denied to project: ${projectId}`);
      }
    }
  }

  // Build query
  const query = buildBaseQuery(userId, projectIds, searchQuery);

  // Get count
  const total = await getFileCount(userId, projectIds, searchQuery);

  // Fetch files with pagination
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Error fetching files:", error);
    throw new Error("Failed to fetch files");
  }

  const files: Promise<FileLibraryItem>[] = !data
    ? []
    : (data as unknown as FileQueryResult[]).map(
        async (file) => await formatFileData(file)
      );

  const hasMore = offset + limit < total;

  return {
    files: await Promise.all(files),
    total,
    hasMore,
  };
}
