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
import { projectIdShape } from "../../lib/documentAccess.ts";
import { deleteProjectData, ProjectVectorDeleteError } from "../../lib/projectDelete.ts";
import { errorInfo } from "../../lib/logSafe.ts";

export async function deleteProject(c: Context) {
  const projectId = c.req.param("projectId");
  if (!projectId) {
    return c.json({ success: false, error: "Project ID is required" }, 400);
  }

  if (projectIdShape(projectId) === "not_found") {
    return c.json({ success: false, error: "Project not found." }, 404);
  }

  const user = currentUser(c);

  const hasAccess = await supabaseService.validateProjectAccess(
    projectId,
    user.id,
  );
  if (!hasAccess) {
    return c.json({ success: false, error: "Access denied to project" }, 403);
  }

  let storageObjects;
  try {
    storageObjects = await deleteProjectData({
      deleteVectors: () => qdrantService.deleteProjectCollection(user.id, projectId),
      deleteStorage: async () =>
        await supabaseService.deleteStorageFiles(
          await supabaseService.listStorageFiles(`${user.id}/${projectId}`),
        ),
      // Cascades to project_files -> document_pages / chat_citations, and to
      // chat_conversations -> chat_messages.
      deleteRow: () => supabaseService.deleteProjectRow(projectId, user.id),
    });
  } catch (error) {
    if (!(error instanceof ProjectVectorDeleteError)) throw error;
    console.error(
      `Could not delete the collection of project ${projectId}:`,
      errorInfo(error.cause),
    );
    return c.json({ success: false, error: error.message }, 500);
  }

  console.log(
    `Deleted project ${projectId}: collection dropped, ${storageObjects} objects removed`,
  );

  return c.json({
    success: true,
    project_id: projectId,
    removed: { collection: true, storageObjects },
  });
}
