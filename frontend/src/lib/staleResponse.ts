/**
 * True when nothing the request was made for has changed while it was in flight.
 *
 * Take a snapshot before the `await` (project id, conversation id, a request
 * counter) and compare it with the same fields after. A reply for a project
 * the user already left must be dropped, not written into the new one.
 */
export const isStillCurrent = <T extends object>(requestedFor: T, currentFor: T): boolean =>
  (Object.keys(requestedFor) as (keyof T)[]).every((key) =>
    Object.is(requestedFor[key], currentFor[key])
  );

/**
 * The reply when the user is still on the project it was asked for, otherwise
 * null. After an upload or a process call the follow-up file list belongs to
 * the captured project, never to whatever is selected by then.
 */
export const replyForProject = <T>(
  reply: T,
  requestedProjectId: string,
  currentProjectId: string | undefined
): T | null =>
  isStillCurrent({ projectId: requestedProjectId }, { projectId: currentProjectId }) ? reply : null;
