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
import { deleteDocumentData, DocumentVectorDeleteError } from "../../lib/documentDelete.ts";
import { errorInfo } from "../../lib/logSafe.ts";

export async function deleteDocument(c: Context) {
  const documentId = c.req.param("documentId");
  if (!documentId) {
    return c.json({ success: false, error: "Document ID is required" }, 400);
  }

  const user = currentUser(c);

  let document;
  try {
    document = await supabaseService.findDocument(documentId, user.id);
  } catch (error) {
    console.error(`Could not read document ${documentId} for delete:`, errorInfo(error));
    return c.json({ success: false, error: "Could not delete the document" }, 500);
  }
  if (!document) {
    return c.json({ success: false, error: "Document not found." }, 404);
  }

  let storageObjects;
  try {
    storageObjects = await deleteDocumentData(document.storage_path, {
      purgeVectors: () =>
        qdrantService.deleteByDocumentId(documentId, user.id, document.project_id),
      listImages: () =>
        supabaseService.listStorageFiles(
          `${user.id}/${document.project_id}/images/${documentId}`,
        ),
      deleteFiles: (paths) => supabaseService.deleteStorageFiles(paths),
      // Cascades to document_pages and chat_citations.
      deleteRow: () => supabaseService.deleteDocumentRow(documentId, user.id),
    });
  } catch (error) {
    if (error instanceof DocumentVectorDeleteError) {
      console.error(
        `Could not delete the vectors of document ${documentId}:`,
        errorInfo(error.cause),
      );
      return c.json({ success: false, error: error.message }, 500);
    }
    console.error(`Could not delete document ${documentId}:`, errorInfo(error));
    return c.json({ success: false, error: "Could not delete the document" }, 500);
  }

  // A failed vector delete returns above, so a success always means the
  // vectors are gone.
  const removed = { vectors: true, storageObjects };

  console.log(
    `Deleted document ${documentId}: vectors=${removed.vectors} objects=${removed.storageObjects}`,
  );

  return c.json({ success: true, document_id: documentId, removed });
}
