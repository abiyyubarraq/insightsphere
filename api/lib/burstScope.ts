/**
 * The file library calls /searchFiles in filename mode on open and on every
 * project toggle. Only semantic mode calls OpenAI, so only it shares the chat
 * burst limit; limiting browsing would use up the budget for chat.
 */
export function isSemanticSearch(body: unknown): boolean {
  return typeof body === "object" && body !== null &&
    (body as { searchMode?: unknown }).searchMode === "semantic";
}
