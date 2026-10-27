/**
 * Uploading the page images the parser wrote. Pure: file reads and uploads
 * come in as functions.
 */

export const MISSING_PAGE_IMAGES_KEY = "missing_page_images";

export interface PageImageUploads {
  /** page number -> storage path, only for pages that uploaded. */
  paths: Record<number, string>;
  /** Page numbers whose image could not be read or uploaded, ascending. */
  missing: number[];
}

/**
 * Uploads one page at a time. A failed page is recorded and skipped, not
 * thrown: images only feed the file-library preview, never answers or citations.
 */
export async function uploadPageImages(
  entries: Record<string, string>,
  readFile: (tempPath: string) => Promise<Uint8Array>,
  upload: (pageNumber: number, data: Uint8Array) => Promise<string>,
): Promise<PageImageUploads> {
  const paths: Record<number, string> = {};
  const missing: number[] = [];
  for (const [pageKey, tempPath] of Object.entries(entries)) {
    const pageNumber = parseInt(pageKey, 10);
    try {
      paths[pageNumber] = await upload(pageNumber, await readFile(tempPath));
    } catch {
      missing.push(pageNumber);
    }
  }
  missing.sort((a, b) => a - b);
  return { paths, missing };
}

/**
 * The new metadata spreads the old one, so a key from an earlier run would
 * survive a fully successful reprocess. It is dropped first, then set only
 * when pages are missing now.
 */
export function withMissingPageImages(
  metadata: Record<string, unknown>,
  missing: number[],
): Record<string, unknown> {
  const { [MISSING_PAGE_IMAGES_KEY]: _old, ...rest } = metadata;
  return missing.length > 0 ? { ...rest, [MISSING_PAGE_IMAGES_KEY]: missing } : rest;
}
