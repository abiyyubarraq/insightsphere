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
