import { describe, expect, it } from 'vitest';
import { readSuggestions, readyFilesKey, suggestionsKey, type WelcomeState } from './suggestions';

const welcome: WelcomeState = {
  projectId: 'p1',
  loadedProjectId: 'p1',
  loadingHistory: false,
  hasMessages: false,
  filesKey: 'a:1',
};

describe('deciding when the empty chat asks for suggestions', () => {
  it('asks once the empty chat is showing for the selected project', () => {
    expect(suggestionsKey(welcome)).toBe('p1|a:1');
  });

  // Each call takes a slot of the per-minute limit chat also uses, and the
  // chips would flash before the history replaced them.
  it.each([
    ['history is still loading', { loadingHistory: true }],
    ['history is for another project', { loadedProjectId: 'p0' }],
    ['the chat has messages', { hasMessages: true }],
    ['the file list is still loading', { filesKey: null }],
    ['no project is selected', { projectId: undefined }],
  ])('does not ask while %s', (_name, change) => {
    expect(suggestionsKey({ ...welcome, ...change })).toBeNull();
  });

  // A document that finishes processing must replace the upload hint without a reload.
  it('asks again when the ready files or their summaries change', () => {
    const before = readyFilesKey([{ id: 'a', status: 'processing', is_summary_exist: false }], false);
    const ready = readyFilesKey([{ id: 'a', status: 'ready', is_summary_exist: false }], false);
    const summarised = readyFilesKey([{ id: 'a', status: 'ready', is_summary_exist: true }], false);

    expect(new Set([before, ready, summarised]).size).toBe(3);
  });

  // The poll replaces the file list every few seconds while something processes.
  it('keeps the same key for the same ready files in another order', () => {
    const a = { id: 'a', status: 'ready', is_summary_exist: false };
    const b = { id: 'b', status: 'ready', is_summary_exist: true };
    const c = { id: 'c', status: 'processing', is_summary_exist: false };
    expect(readyFilesKey([a, b, c], false)).toBe(readyFilesKey([c, b, a], false));
  });

  it('has no key while the file list is loading', () => {
    expect(readyFilesKey([], true)).toBeNull();
  });
});

describe('reading the suggestions answer', () => {
  it('shows up to four trimmed questions as chips', () => {
    const view = readSuggestions({
      source: 'generated',
      suggestions: [' What is A? ', 'What is B?', 'What is C?', 'What is D?', 'What is E?'],
    });
    expect(view).toEqual({
      status: 'chips',
      suggestions: ['What is A?', 'What is B?', 'What is C?', 'What is D?'],
    });
  });

  it('shows the upload hint when the project has no ready documents', () => {
    expect(readSuggestions({ source: 'empty', suggestions: [] })).toEqual({ status: 'empty' });
  });

  // Model text reaches the page; a broken answer shows nothing rather than a broken chip.
  it.each([
    ['not an object', null],
    ['no list', { source: 'generated' }],
    ['nothing usable', { source: 'fallback', suggestions: ['', '  ', 3] }],
  ])('shows nothing for %s', (_name, response) => {
    expect(readSuggestions(response)).toEqual({ status: 'hidden' });
  });
});
