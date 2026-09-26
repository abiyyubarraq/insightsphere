/**
 * DELETE /v1/documents/:documentId
 *
 * Removing the row alone used to be the whole operation, which left the
 * document's vectors in Qdrant. Chat kept quoting files the user had deleted,
 * and the page images stayed in storage indefinitely.
 */

import type { Context } from "hono";
import { currentUser } from "../../lib/auth.ts";
import { supabaseService } from "../../lib/supabaseClient.ts";
import { qdrantService } from "../../lib/qdrantClient.ts";

export async function deleteDocument(c: Context) {
  const documentId = c.req.param("documentId");
  if (!documentId) {
    return c.json({ success: false, error: "Document ID is required" }, 400);
  }

  const user = currentUser(c);

  let document;
  try {
    document = await supabaseService.getDocument(documentId, user.id);
  } catch {
    return c.json({ success: false, error: "Document not found" }, 404);
  }

  const removed = { vectors: false, storageObjects: 0 };

  // Vectors first. If a later step fails the document still exists, and a retry
  // is harmless; the reverse order could leave orphaned vectors with no row to
  // find them by.
  try {
    await qdrantService.deleteByDocumentId(
      documentId,
      user.id,
      document.project_id,
    );
    removed.vectors = true;
  } catch (error) {
    console.error(`Failed to delete vectors for ${documentId}:`, error);
  }

  const paths = [
    document.storage_path,
    ...await supabaseService.listStorageFiles(
      `${user.id}/${document.project_id}/images/${documentId}`,
    ),
  ].filter(Boolean);
  removed.storageObjects = await supabaseService.deleteStorageFiles(paths);

  // Cascades to document_pages and chat_citations.
  await supabaseService.deleteDocumentRow(documentId, user.id);

  console.log(
    `Deleted document ${documentId}: vectors=${removed.vectors} objects=${removed.storageObjects}`,
  );

  return c.json({ success: true, document_id: documentId, removed });
}
