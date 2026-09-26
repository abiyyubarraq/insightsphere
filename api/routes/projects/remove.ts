/**
 * DELETE /v1/projects/:projectId
 *
 * Drops the whole per-project Qdrant collection rather than deleting document
 * by document, and clears every object under the project's storage prefix.
 */

import type { Context } from "hono";
import { currentUser } from "../../lib/auth.ts";
import { supabaseService } from "../../lib/supabaseClient.ts";
import { qdrantService } from "../../lib/qdrantClient.ts";

export async function deleteProject(c: Context) {
  const projectId = c.req.param("projectId");
  if (!projectId) {
    return c.json({ success: false, error: "Project ID is required" }, 400);
  }

  const user = currentUser(c);

  const hasAccess = await supabaseService.validateProjectAccess(
    projectId,
    user.id,
  );
  if (!hasAccess) {
    return c.json({ success: false, error: "Access denied to project" }, 403);
  }

  await qdrantService.deleteProjectCollection(user.id, projectId);

  const paths = await supabaseService.listStorageFiles(
    `${user.id}/${projectId}`,
  );
  const storageObjects = await supabaseService.deleteStorageFiles(paths);

  // Cascades to project_files -> document_pages / chat_citations, and to
  // chat_conversations -> chat_messages.
  await supabaseService.deleteProjectRow(projectId, user.id);

  console.log(
    `Deleted project ${projectId}: collection dropped, ${storageObjects} objects removed`,
  );

  return c.json({
    success: true,
    project_id: projectId,
    removed: { collection: true, storageObjects },
  });
}
