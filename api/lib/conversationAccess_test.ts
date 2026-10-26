import { assertEquals, assertRejects } from "@std/assert";
import {
  checkBodyConversation,
  conversationAccess,
  type ConversationOwner,
  isUuid,
} from "./conversationAccess.ts";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const PROJECT_A = "33333333-3333-4333-8333-333333333333";
const PROJECT_B = "44444444-4444-4444-8444-444444444444";
const CONVERSATION = "55555555-5555-4555-8555-555555555555";

const row = (overrides: Partial<ConversationOwner> = {}): ConversationOwner => ({
  id: CONVERSATION,
  user_id: USER_A,
  project_id: PROJECT_A,
  ...overrides,
});

/** A loader that records every id it was asked for. */
const loader = (result: ConversationOwner | null) => {
  const calls: string[] = [];
  const load = (id: string) => {
    calls.push(id);
    return Promise.resolve(result);
  };
  return { load, calls };
};

// The user's own conversation in the URL project must keep working.
Deno.test("own conversation in the right project is allowed", async () => {
  assertEquals(conversationAccess(row(), USER_A, PROJECT_A), "allowed");
  const { load } = loader(row());
  assertEquals(await checkBodyConversation(CONVERSATION, USER_A, PROJECT_A, load), "allowed");
});

// A user who knew another user's conversation id could read and write it.
Deno.test("another user's conversation is not found", async () => {
  assertEquals(conversationAccess(row(), USER_B, PROJECT_A), "not_found");
  const { load } = loader(row());
  assertEquals(await checkBodyConversation(CONVERSATION, USER_B, PROJECT_A, load), "not_found");
});

// A conversation from one project must not receive messages sent to another.
Deno.test("own conversation in a different project is not found", async () => {
  assertEquals(conversationAccess(row(), USER_A, PROJECT_B), "not_found");
  const { load } = loader(row());
  assertEquals(await checkBodyConversation(CONVERSATION, USER_A, PROJECT_B, load), "not_found");
});

// An unknown id must give the same answer as someone else's, so ids cannot be probed.
Deno.test("an unknown conversation id is not found", async () => {
  assertEquals(conversationAccess(null, USER_A, PROJECT_A), "not_found");
  const { load } = loader(null);
  assertEquals(await checkBodyConversation(CONVERSATION, USER_A, PROJECT_A, load), "not_found");
});

// A non-UUID id reached Postgres as 22P02 and ended as a 500.
Deno.test("a non-UUID, an empty string and a non-string id are not found without a lookup", async () => {
  for (const id of ["not-a-uuid", "", 42, {}, [CONVERSATION]]) {
    const { load, calls } = loader(row());
    assertEquals(await checkBodyConversation(id, USER_A, PROJECT_A, load), "not_found");
    assertEquals(calls, []);
  }
  assertEquals(isUuid(CONVERSATION), true);
});

// A first message has no id; the route must still find or create the conversation.
Deno.test("no conversation id skips the check", async () => {
  for (const id of [undefined, null]) {
    const { load, calls } = loader(row());
    assertEquals(await checkBodyConversation(id, USER_A, PROJECT_A, load), "none");
    assertEquals(calls, []);
  }
});

// A database error must end as a 500, never fall through to allowed.
Deno.test("a failing lookup rejects instead of allowing", async () => {
  await assertRejects(
    () =>
      checkBodyConversation(CONVERSATION, USER_A, PROJECT_A, () =>
        Promise.reject(new Error("db down"))),
    Error,
    "db down",
  );
});
