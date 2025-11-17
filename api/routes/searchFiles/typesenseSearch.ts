import type { ListFilesResponse } from "../../../shared/types/index.ts";
import { ListFilesRequest } from "./search.ts";

/**
 * Handle typesense search mode (placeholder)
 */
export function handleTypesenseSearch(
  _userId: string,
  request: ListFilesRequest
): Promise<ListFilesResponse> {
  console.log(
    "🔍 Typesense search (placeholder) for query:",
    request.searchQuery
  );
  return Promise.resolve({
    files: [],
    total: 0,
    hasMore: false,
  });
}
