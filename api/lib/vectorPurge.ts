/**
 * Removing a document's old Qdrant points before it is indexed again. Pure:
 * the Qdrant calls come in as functions.
 */

export const VECTOR_REPLACE_FAILED =
  "Could not replace the old search index for this document. Process it again.";

/**
 * Deletes from each target collection that exists. A missing collection has
 * nothing to purge, so it is skipped. That is decided from the collection list
 * and not from the delete error, so any error here is a real failure and throws.
 */
export async function purgeFromCollections(
  targets: readonly string[],
  existing: () => Promise<readonly string[]>,
  remove: (collection: string) => Promise<void>,
): Promise<void> {
  const present = new Set(await existing());
  for (const collection of targets) {
    if (present.has(collection)) await remove(collection);
  }
}

/**
 * Runs `write` only after `purge` succeeded. Chunk ids are per page and chunk
 * index, so an upsert does not replace the chunks of pages a shorter new
 * version no longer has; without the purge they stay searchable and citable.
 * The purge error is kept as `cause` for the log and never shown to the user.
 */
export async function replaceDocumentVectors<T>(
  purge: () => Promise<void>,
  write: () => Promise<T>,
): Promise<T> {
  try {
    await purge();
  } catch (error) {
    throw new Error(VECTOR_REPLACE_FAILED, { cause: error });
  }
  return await write();
}
