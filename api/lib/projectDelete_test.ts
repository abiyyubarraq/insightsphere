import { assertEquals, assertInstanceOf, assertRejects } from "@std/assert";
import {
  deleteProjectData,
  PROJECT_VECTOR_DELETE_FAILED,
  ProjectVectorDeleteError,
  type ProjectDeleteSteps,
} from "./projectDelete.ts";

function steps(calls: string[], overrides: Partial<ProjectDeleteSteps> = {}): ProjectDeleteSteps {
  return {
    deleteVectors: () => {
      calls.push("vectors");
      return Promise.resolve();
    },
    deleteStorage: () => {
      calls.push("storage");
      return Promise.resolve(4);
    },
    deleteRow: () => {
      calls.push("row");
      return Promise.resolve();
    },
    ...overrides,
  };
}

// A Qdrant outage during project delete was logged and ignored: the project
// row and files were deleted, and its collection stayed with no way to find it.
Deno.test("a failed vector delete stops before storage and the row", async () => {
  const calls: string[] = [];
  const qdrantError = new Error("Service Unavailable");
  const error = await assertRejects(
    () => deleteProjectData(steps(calls, { deleteVectors: () => Promise.reject(qdrantError) })),
    ProjectVectorDeleteError,
  );
  assertEquals(error.message, PROJECT_VECTOR_DELETE_FAILED);
  assertEquals(
    PROJECT_VECTOR_DELETE_FAILED,
    "Could not delete the project's search index. Try again.",
  );
  assertInstanceOf(error.cause, Error);
  assertEquals(calls, []);
});

// Deleting the row first would cascade the file rows away and leave the
// storage objects and vectors behind if a later step failed.
Deno.test("vectors, then storage, then the row, and the object count is returned", async () => {
  const calls: string[] = [];
  const removed = await deleteProjectData(steps(calls));
  assertEquals(calls, ["vectors", "storage", "row"]);
  assertEquals(removed, 4);
});

// A storage error must keep the row, so the project can still be found and
// deleted again.
Deno.test("a failed storage delete keeps the row", async () => {
  const calls: string[] = [];
  await assertRejects(
    () =>
      deleteProjectData(
        steps(calls, { deleteStorage: () => Promise.reject(new Error("storage down")) }),
      ),
    Error,
    "storage down",
  );
  assertEquals(calls, ["vectors"]);
});
