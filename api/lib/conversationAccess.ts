import { validate } from "@std/uuid";

export interface ConversationOwner {
  id: string;
  user_id: string;
  project_id: string;
}

export type ConversationCheck = "none" | "allowed" | "not_found";

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && validate(value);
}

export function conversationAccess(
  row: ConversationOwner | null,
  userId: string,
  projectId: string,
): "allowed" | "not_found" {
  return row !== null && row.user_id === userId && row.project_id === projectId
    ? "allowed"
    : "not_found";
}

/**
 * The API reads conversations with the service role, which bypasses RLS, so a
 * conversation id from the request body is checked here. "none" means the body
 * had no id and the caller finds or creates the user's own conversation.
 * A failing `load` rejects, so a database error never reads as allowed.
 */
export async function checkBodyConversation(
  conversationId: unknown,
  userId: string,
  projectId: string,
  load: (id: string) => Promise<ConversationOwner | null>,
): Promise<ConversationCheck> {
  if (conversationId === undefined || conversationId === null) return "none";
  // Not a UUID: Postgres would answer 22P02 for the uuid column.
  if (!isUuid(conversationId)) return "not_found";
  return conversationAccess(await load(conversationId), userId, projectId);
}
