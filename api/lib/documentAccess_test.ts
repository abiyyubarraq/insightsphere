import { assertEquals } from "@std/assert";
import { type DocumentOwner, documentInProject } from "./documentAccess.ts";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const PROJECT_A = "33333333-3333-4333-8333-333333333333";
const PROJECT_B = "44444444-4444-4444-8444-444444444444";

const document = (overrides: Partial<DocumentOwner> = {}): DocumentOwner => ({
  user_id: USER_A,
  project_id: PROJECT_A,
  ...overrides,
});

// Processing or summarising the user's own document in its own project must keep working.
Deno.test("own document in its own project is allowed", () => {
  assertEquals(documentInProject(document(), USER_A, PROJECT_A), "allowed");
});

// A body project_id of the user's other project put the document's vectors
// into that project's collection.
Deno.test("own document with another project in the body is not found", () => {
  assertEquals(documentInProject(document(), USER_A, PROJECT_B), "not_found");
});

// The document of another user must never be processed, even in the right project.
Deno.test("another user's document is not found", () => {
  assertEquals(documentInProject(document({ user_id: USER_B }), USER_A, PROJECT_A), "not_found");
});
