import { FileLibraryItem } from "../../../shared/types/index.ts";
import { supabaseService } from "../../lib/supabaseClient.ts";

/**
 * Format file data from Supabase response
 */
export async function formatFileData(
  file: Record<string, unknown>
): Promise<FileLibraryItem> {
  const projectName =
    (file.projects as { name: string } | null | undefined)?.name ||
    "Unknown Project";

  const imagePaths = file.image_paths as
    | Record<number, string>
    | null
    | undefined;

  // Get the first page image URL if available
  let firstImageUrl: string | null = null;
  if (imagePaths && imagePaths[1]) {
    // Page numbers start at 1, so check imagePaths[1] for first page
    try {
      firstImageUrl = await supabaseService.getPublicUrl(imagePaths[1]);
    } catch (error) {
      console.warn(
        `Failed to get image URL for file ${file.id}:`,
        error instanceof Error ? error.message : error
      );
      firstImageUrl = null;
    }
  }

  return {
    fileId: file.id as string,
    name: file.file_name as string,
    createdAt: file.created_at as string,
    projectId: file.project_id as string,
    projectName,
    storage_path: file.storage_path as string,
    imagePaths: imagePaths || undefined,
    firstImageUrl,
  };
}

/**
 * Build base Supabase query for file listing
 */
export function buildBaseQuery(
  userId: string,
  projectIds?: string[],
  searchQuery?: string
) {
  const selectFields =
    "id, file_name, created_at, project_id, storage_path, image_paths, projects!inner(name)";

  let query = supabaseService
    .getClient()
    .from("project_files")
    .select(selectFields)
    .eq("user_id", userId);

  if (projectIds && projectIds.length > 0) {
    query = query.in("project_id", projectIds);
  }

  if (searchQuery && searchQuery.trim()) {
    query = query.ilike("file_name", `%${searchQuery}%`);
  }

  return query;
}

/**
 * Get file count with same filters
 */
export async function getFileCount(
  userId: string,
  projectIds?: string[],
  searchQuery?: string
): Promise<number> {
  let countQuery = supabaseService
    .getClient()
    .from("project_files")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (projectIds && projectIds.length > 0) {
    countQuery = countQuery.in("project_id", projectIds);
  }

  if (searchQuery && searchQuery.trim()) {
    countQuery = countQuery.ilike("file_name", `%${searchQuery}%`);
  }

  const { count, error: countError } = await countQuery;

  if (countError) {
    console.error("Error counting files:", countError);
    throw new Error("Failed to count files");
  }

  return count || 0;
}
