/**
 * Keeping document_pages equal to the latest processing result. Pure: the
 * database calls come in as functions.
 */

/** PostgREST returns at most this many rows per request by default. */
export const PAGE_READ_SIZE = 1000;

export interface ParsedPage {
  page_number: number;
  text: string;
}

export interface PageStore {
  storeDocumentPages(
    documentId: string,
    pages: ParsedPage[],
    imagePaths?: Record<number, string>,
  ): Promise<void>;
  /** Deletes this document's rows with a page_number above `lastPage`. */
  deleteDocumentPagesAbove(documentId: string, lastPage: number): Promise<void>;
}

/** The highest page number in the new result, or null when there is none. */
export function lastPageToKeep(pages: ParsedPage[]): number | null {
  if (pages.length === 0) return null;
  return Math.max(...pages.map((page) => page.page_number));
}

/**
 * Upserts the new pages, then deletes the rows of a longer earlier result.
 * Without the delete, a document processed again with fewer pages kept its old
 * pages, and their text went into the summary. Throws when either step fails,
 * and nothing is deleted when the upsert failed.
 */
export async function persistDocumentPages(
  store: PageStore,
  documentId: string,
  pages: ParsedPage[],
  imagePaths?: Record<number, string>,
): Promise<void> {
  await store.storeDocumentPages(documentId, pages, imagePaths);
  const lastPage = lastPageToKeep(pages);
  if (lastPage !== null) await store.deleteDocumentPagesAbove(documentId, lastPage);
}

/**
 * Reads rows `size` at a time until a read returns less than a full page, so
 * the default row cap cannot cut a long document short. `readRange` takes
 * inclusive bounds, like PostgREST's range.
 */
export async function readAllPages<T>(
  readRange: (from: number, to: number) => Promise<T[]>,
  size = PAGE_READ_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const batch = await readRange(from, from + size - 1);
    rows.push(...batch);
    if (batch.length < size) return rows;
  }
}
