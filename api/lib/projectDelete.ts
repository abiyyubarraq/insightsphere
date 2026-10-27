export const PROJECT_VECTOR_DELETE_FAILED =
  "Could not delete the project's search index. Try again.";

/** The Qdrant error is kept as `cause` for the log and never shown to the user. */
export class ProjectVectorDeleteError extends Error {
  constructor(cause: unknown) {
    super(PROJECT_VECTOR_DELETE_FAILED, { cause });
    this.name = "ProjectVectorDeleteError";
  }
}

export interface ProjectDeleteSteps {
  deleteVectors: () => Promise<void>;
  deleteStorage: () => Promise<number>;
  deleteRow: () => Promise<void>;
}

/**
 * Removes the project's vectors, then its storage objects, then its row, and
 * returns how many objects were removed. When the vectors cannot be removed
 * nothing else is touched, so the project still exists and a retry finishes
 * the job instead of leaving vectors that no row points to.
 */
export async function deleteProjectData(steps: ProjectDeleteSteps): Promise<number> {
  try {
    await steps.deleteVectors();
  } catch (error) {
    throw new ProjectVectorDeleteError(error);
  }
  const storageObjects = await steps.deleteStorage();
  await steps.deleteRow();
  return storageObjects;
}
