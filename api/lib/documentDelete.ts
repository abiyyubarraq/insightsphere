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
