import { assertEquals, assertRejects } from "@std/assert";
import { type DocumentDeleteSteps, deleteFilesAndRow } from "./documentDelete.ts";

const STORAGE_PATH = "user/project/123_file.pdf";
const IMAGES = ["user/project/images/doc/page-1.png", "user/project/images/doc/page-2.png"];

interface Calls {
  deletedPaths: string[][];
  rowDeleted: boolean;
}

const steps = (
  calls: Calls,
  overrides: Partial<DocumentDeleteSteps> = {},
): DocumentDeleteSteps => ({
  listImages: () => Promise.resolve(IMAGES),
  deleteFiles: (paths) => {
    calls.deletedPaths.push(paths);
    return Promise.resolve(paths.length);
  },
  deleteRow: () => {
    calls.rowDeleted = true;
    return Promise.resolve();
  },
  ...overrides,
});

const freshCalls = (): Calls => ({ deletedPaths: [], rowDeleted: false });

// Deleting a document must remove the original file, every page image and the row.
Deno.test("all steps succeed: the file, the page images and the row are removed", async () => {
  const calls = freshCalls();
  const removed = await deleteFilesAndRow(STORAGE_PATH, steps(calls));
  assertEquals(removed, 3);
  assertEquals(calls.deletedPaths, [[STORAGE_PATH, ...IMAGES]]);
  assertEquals(calls.rowDeleted, true);
});

// A document with no page images (text or DOCX) must still delete cleanly.
Deno.test("no page images: only the original file and the row are removed", async () => {
  const calls = freshCalls();
  const removed = await deleteFilesAndRow(
    STORAGE_PATH,
    steps(calls, { listImages: () => Promise.resolve([]) }),
  );
  assertEquals(removed, 1);
  assertEquals(calls.deletedPaths, [[STORAGE_PATH]]);
  assertEquals(calls.rowDeleted, true);
});

// A storage listing error escaped the route and was answered by the global
// error handler, not by the route's own 500 sentence.
Deno.test("listing the page images throws: the error reaches the route and the row stays", async () => {
  const calls = freshCalls();
  await assertRejects(
    () =>
      deleteFilesAndRow(
        STORAGE_PATH,
        steps(calls, { listImages: () => Promise.reject(new Error("storage down")) }),
      ),
    Error,
    "storage down",
  );
  assertEquals(calls.deletedPaths, []);
  assertEquals(calls.rowDeleted, false);
});

// Deleting the files failed outside any try/catch, same as the listing.
Deno.test("deleting the files throws: the error reaches the route and the row stays", async () => {
  const calls = freshCalls();
  await assertRejects(
    () =>
      deleteFilesAndRow(
        STORAGE_PATH,
        steps(calls, { deleteFiles: () => Promise.reject(new Error("network error")) }),
      ),
    Error,
    "network error",
  );
  assertEquals(calls.rowDeleted, false);
});

// A database error on the row delete escaped the route the same way.
Deno.test("deleting the row throws: the error reaches the route", async () => {
  const calls = freshCalls();
  await assertRejects(
    () =>
      deleteFilesAndRow(
        STORAGE_PATH,
        steps(calls, { deleteRow: () => Promise.reject(new Error("Failed to delete document")) }),
      ),
    Error,
    "Failed to delete document",
  );
  assertEquals(calls.deletedPaths, [[STORAGE_PATH, ...IMAGES]]);
});
