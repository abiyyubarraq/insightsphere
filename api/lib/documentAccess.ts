import { isUuid } from "./conversationAccess.ts";

export interface DocumentOwner {
  user_id: string;
  project_id: string;
}

/**
 * The document routes take `project_id` from the request body and use it for
 * the Qdrant collection, so it must be the document row's own project.
 */
export function documentInProject(
  document: DocumentOwner,
  userId: string,
  projectId: string,
): "allowed" | "not_found" {
  return document.user_id === userId && document.project_id === projectId
    ? "allowed"
    : "not_found";
}

/**
 * A project id that is not a UUID would reach Postgres as 22P02, which the
 * project access check reads as "denied". It is a project that cannot exist,
 * so it gets the not-found answer instead.
 */
export function projectIdShape(projectId: unknown): "valid" | "not_found" {
  return isUuid(projectId) ? "valid" : "not_found";
}

export interface DocumentLookup<T> {
  data: T | null;
  error: { code: string; message: string } | null;
}

/**
 * Reads a `project_files` lookup by id and user. Missing, another user's and a
 * malformed id all mean "not found" (null), so a 404 never says whether the id
 * exists for someone else. Any other database error throws and stays a 500.
 */
export function documentFromLookup<T extends { user_id: string }>(
  result: DocumentLookup<T>,
  userId: string,
): T | null {
  if (result.error) {
    // 22P02: the id is not a UUID, so Postgres cannot compare it to the column.
    if (result.error.code === "22P02") return null;
    throw new Error(`Failed to fetch document: ${result.error.message}`);
  }
  return result.data !== null && result.data.user_id === userId ? result.data : null;
}
