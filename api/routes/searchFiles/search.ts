/**
 * File Library Endpoint
 * POST /v1/files
 * Returns a list of files from all user projects with filtering and pagination
 */
import type { Context } from "hono";
import { supabaseService } from "../../lib/supabaseClient.ts";
import type { ListFilesResponse } from "../../../shared/types/index.ts";
import { handleSemanticSearch } from "./semanticSearch.ts";
import { handleFilenameSearch } from "./fileNameSearch.ts";

export interface ListFilesRequest {
  limit?: number;
  offset?: number;
  searchQuery?: string;
  searchMode?: "filename" | "semantic";
  projectIds?: string[];
}

export type FileQueryResult = {
  id: string;
  file_name: string;
  created_at: string;
  project_id: string;
  storage_path: string;
  projects?: { name: string };
  image_paths: Record<number, string>;
};

/**
 * Validate user authentication and return user object.
 *
 * getUserFromToken throws on a bad or expired token rather than returning null,
 * so the error has to be caught here. Letting it escape put an expired session
 * through the generic handler as a 500, and the file library showed "Failed to
 * list files" where it should have sent the user back to sign in.
 */
async function authenticateUser(c: Context) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Unauthorized");
  }

  try {
    return await supabaseService.getUserFromToken(
      authHeader.slice("Bearer ".length),
    );
  } catch {
    throw new Error("Unauthorized");
  }
}

/**
 * Main endpoint handler
 */
export async function searchFiles(c: Context) {
  try {
    // Only accept POST method
    if (c.req.method !== "POST") {
      return c.json({ error: "Method not allowed. Use POST." }, 405);
    }

    // Parse request body
    const body = (await c.req.json()) as ListFilesRequest;
    const {
      limit = 100,
      offset = 0,
      searchQuery = "",
      searchMode = "filename",
      projectIds = [],
    } = body;

    // Authenticate user
    const user = await authenticateUser(c);

    console.log(`📁 Listing files for user: ${user.id}, mode: ${searchMode}`);

    // Route to appropriate handler based on search mode
    let result: ListFilesResponse;

    switch (searchMode) {
      case "semantic":
        result = await handleSemanticSearch(user.id, {
          limit,
          offset,
          searchQuery: searchQuery.trim() || undefined,
          projectIds: projectIds.length > 0 ? projectIds : undefined,
        });
        break;

      case "filename":
      default:
        result = await handleFilenameSearch(user.id, {
          limit,
          offset,
          searchQuery: searchQuery.trim() || undefined,
          projectIds: projectIds.length > 0 ? projectIds : undefined,
        });
        break;
    }

    return c.json(result);
  } catch (error) {
    console.error("File listing failed:", error);

    if (error instanceof Error && error.message === "Unauthorized") {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (error instanceof Error && error.message.includes("Access denied")) {
      return c.json({ error: error.message }, 403);
    }

    return c.json(
      {
        error: "Failed to list files",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
}
