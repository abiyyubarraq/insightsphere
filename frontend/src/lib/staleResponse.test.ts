import { describe, expect, it } from 'vitest';
import { isStillCurrent, replyForProject } from './staleResponse';

describe('deciding if a reply still belongs on screen', () => {
  it('accepts a reply when nothing changed', () => {
    expect(isStillCurrent({ projectId: 'a', request: 3 }, { projectId: 'a', request: 3 })).toBe(
      true
    );
  });

  // The file list of project A was written into project B when the user
  // switched while A's files were still loading.
  it('drops a reply for a project the user already left', () => {
    expect(isStillCurrent({ projectId: 'a', request: 3 }, { projectId: 'b', request: 3 })).toBe(
      false
    );
  });

  // A to B and back to A: the first A request is older than the second and
  // must not overwrite it.
  it('drops an older request for the same project', () => {
    expect(isStillCurrent({ projectId: 'a', request: 3 }, { projectId: 'a', request: 5 })).toBe(
      false
    );
  });

  // Creating a project selects it with no files; a project id of undefined
  // after a delete must also count as a change.
  it('drops a reply when no project is selected any more', () => {
    expect(
      isStillCurrent<{ projectId: string | undefined }>(
        { projectId: 'a' },
        { projectId: undefined }
      )
    ).toBe(false);
  });

  // An older chat page that returned after New chat or a project switch was
  // prepended into the other conversation.
  it.each([
    ['conversation', { conversationId: 'c2', projectId: 'p1', generation: 1 }],
    ['project', { conversationId: 'c1', projectId: 'p2', generation: 1 }],
    ['generation', { conversationId: 'c1', projectId: 'p1', generation: 2 }],
  ])('drops an older chat page when the %s changed', (_name, current) => {
    const requested = { conversationId: 'c1', projectId: 'p1', generation: 1 };
    expect(isStillCurrent(requested, current)).toBe(false);
  });
});

describe('applying a file list after an upload or a process call', () => {
  const files = [{ id: 'f1' }];

  it('keeps the list when the user is still on that project', () => {
    expect(replyForProject(files, 'a', 'a')).toBe(files);
  });

  // Project A's files were written into project B when the user switched
  // while A's upload was still running.
  it('drops the list when the user switched project or has none selected', () => {
    expect(replyForProject(files, 'a', 'b')).toBeNull();
    expect(replyForProject(files, 'a', undefined)).toBeNull();
  });
});
