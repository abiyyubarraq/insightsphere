import { assertEquals, assertRejects } from "@std/assert";
import {
  purgeFromCollections,
  replaceDocumentVectors,
  VECTOR_REPLACE_FAILED,
} from "./vectorPurge.ts";

const USER = "insightsphere-documents_user_u1";
const PROJECT = "insightsphere-documents_user_u1_project_p1";

function collections(names: string[], failList = false, failDeleteOn?: string) {
  const deleted: string[] = [];
  return {
    deleted,
    existing: () =>
      failList
        ? Promise.reject(new Error("Service Unavailable"))
        : Promise.resolve(names),
    remove: (collection: string) => {
      if (collection === failDeleteOn) return Promise.reject(new Error("Service Unavailable"));
      deleted.push(collection);
      return Promise.resolve();
    },
  };
}

// The first processing of a document has no per-user collection, and maybe no
// project collection yet. That must not fail the document.
Deno.test("a collection that does not exist is skipped without an error", async () => {
  const qdrant = collections([PROJECT]);
  await purgeFromCollections([USER, PROJECT], qdrant.existing, qdrant.remove);
  assertEquals(qdrant.deleted, [PROJECT]);
});

// Nothing indexed at all yet: no delete call and no error.
Deno.test("no delete is called when no target collection exists", async () => {
  const qdrant = collections([]);
  await purgeFromCollections([USER, PROJECT], qdrant.existing, qdrant.remove);
  assertEquals(qdrant.deleted, []);
});

// The delete error used to be caught and logged, so a failed purge looked like
// a success and the old chunks of removed pages stayed searchable.
Deno.test("a failed delete on an existing collection throws", async () => {
  const qdrant = collections([USER, PROJECT], false, PROJECT);
  await assertRejects(
    () => purgeFromCollections([USER, PROJECT], qdrant.existing, qdrant.remove),
    Error,
    "Service Unavailable",
  );
});

// When the collection list cannot be read, it is unknown whether old points
// exist, so the purge cannot be called done.
Deno.test("a failed collection list throws", async () => {
  const qdrant = collections([PROJECT], true);
  await assertRejects(
    () => purgeFromCollections([USER, PROJECT], qdrant.existing, qdrant.remove),
    Error,
    "Service Unavailable",
  );
  assertEquals(qdrant.deleted, []);
});

// A reprocess whose purge failed went on to upsert and ended ready, with
// stale chunks of pages that no longer exist.
Deno.test("a failed purge stops before any write and gives the fixed message", async () => {
  let writes = 0;
  const error = await assertRejects(
    () =>
      replaceDocumentVectors(
        () => Promise.reject(new Error("Failed to delete document chunks: Service Unavailable")),
        () => {
          writes++;
          return Promise.resolve();
        },
      ),
    Error,
  );
  assertEquals(error.message, VECTOR_REPLACE_FAILED);
  assertEquals(
    VECTOR_REPLACE_FAILED,
    "Could not replace the old search index for this document. Process it again.",
  );
  assertEquals(writes, 0);
});

// The normal path must still index the document, once.
Deno.test("a successful purge runs the write once and returns its result", async () => {
  let writes = 0;
  const result = await replaceDocumentVectors(
    () => Promise.resolve(),
    () => {
      writes++;
      return Promise.resolve(7);
    },
  );
  assertEquals(writes, 1);
  assertEquals(result, 7);
});

// First processing: the collections do not exist yet, and indexing continues.
Deno.test("a missing collection lets the write run", async () => {
  const qdrant = collections([]);
  let writes = 0;
  await replaceDocumentVectors(
    () => purgeFromCollections([USER, PROJECT], qdrant.existing, qdrant.remove),
    () => {
      writes++;
      return Promise.resolve();
    },
  );
  assertEquals(writes, 1);
});

// Project delete caught every Qdrant error as "nothing was indexed", so an
// outage deleted the project and left its collection behind.
Deno.test("project collection: present is deleted once, missing is a no-op", async () => {
  const present = collections([USER, PROJECT]);
  await purgeFromCollections([PROJECT], present.existing, present.remove);
  assertEquals(present.deleted, [PROJECT]);

  const missing = collections([USER]);
  await purgeFromCollections([PROJECT], missing.existing, missing.remove);
  assertEquals(missing.deleted, []);
});

// Same bug: a failed list or delete must reach the route as an error.
Deno.test("project collection: a failed list or delete throws", async () => {
  const listFails = collections([PROJECT], true);
  await assertRejects(
    () => purgeFromCollections([PROJECT], listFails.existing, listFails.remove),
    Error,
    "Service Unavailable",
  );
  assertEquals(listFails.deleted, []);

  const deleteFails = collections([PROJECT], false, PROJECT);
  await assertRejects(
    () => purgeFromCollections([PROJECT], deleteFails.existing, deleteFails.remove),
    Error,
    "Service Unavailable",
  );
});
