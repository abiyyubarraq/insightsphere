export interface DocumentDeleteSteps {
  listImages: () => Promise<string[]>;
  deleteFiles: (paths: string[]) => Promise<number>;
  deleteRow: () => Promise<void>;
}

/**
 * Removes the document's storage objects, then its row, and returns how many
 * objects were removed. Any failing step rejects, and the row is only deleted
 * after the files, so a retry finds the document again.
 */
export async function deleteFilesAndRow(
  storagePath: string,
  steps: DocumentDeleteSteps,
): Promise<number> {
  const paths = [storagePath, ...await steps.listImages()].filter(Boolean);
  const removed = await steps.deleteFiles(paths);
  await steps.deleteRow();
  return removed;
}

export const DOCUMENT_VECTOR_DELETE_FAILED = "Could not delete the document. Try again.";

/** The Qdrant error is kept as `cause` for the log and never shown to the user. */
export class DocumentVectorDeleteError extends Error {
  constructor(cause: unknown) {
    super(DOCUMENT_VECTOR_DELETE_FAILED, { cause });
    this.name = "DocumentVectorDeleteError";
  }
}

export interface DocumentDataSteps extends DocumentDeleteSteps {
  purgeVectors: () => Promise<void>;
}

/**
 * Removes the document's vectors, then its files and row. A failed purge used
 * to be logged and skipped, which deleted the row and left the vectors
 * searchable with nothing pointing to them. Now nothing else is touched, so a
 * retry finishes the job.
 */
export async function deleteDocumentData(
  storagePath: string,
  steps: DocumentDataSteps,
): Promise<number> {
  try {
    await steps.purgeVectors();
  } catch (error) {
    throw new DocumentVectorDeleteError(error);
  }
  return await deleteFilesAndRow(storagePath, steps);
}
