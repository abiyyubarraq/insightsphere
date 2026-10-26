export const MAX_SUGGESTIONS = 4;

interface FileState {
  id: string;
  status: string | null;
  is_summary_exist: boolean;
}

/**
 * Changes when a document becomes ready or gets a summary, so the empty chat
 * can ask again without a reload. Null while the file list is still loading,
 * because an empty list then says nothing about the project.
 */
export const readyFilesKey = (files: FileState[], loading: boolean): string | null =>
  loading
    ? null
    : files
        .filter((file) => file.status === 'ready')
        .map((file) => `${file.id}:${file.is_summary_exist ? 1 : 0}`)
        .sort()
        .join(',');

export interface WelcomeState {
  projectId: string | undefined;
  loadedProjectId: string | undefined;
  loadingHistory: boolean;
  hasMessages: boolean;
  filesKey: string | null;
}

/**
 * What the suggestions on screen are for, or null when none should be fetched
 * or shown. Every call counts against the same per-minute limit as chat, so
 * this is null until the empty chat is really showing for this project.
 */
export const suggestionsKey = (state: WelcomeState): string | null => {
  const { projectId, loadedProjectId, loadingHistory, hasMessages, filesKey } = state;
  if (!projectId || loadedProjectId !== projectId) return null;
  if (loadingHistory || hasMessages || filesKey === null) return null;
  return `${projectId}|${filesKey}`;
};

export type SuggestionsView =
  | { status: 'loading' }
  | { status: 'chips'; suggestions: string[] }
  | { status: 'empty' }
  | { status: 'hidden' };

/** The API's answer as something to render; anything unexpected shows nothing. */
export const readSuggestions = (response: unknown): SuggestionsView => {
  if (typeof response !== 'object' || response === null) return { status: 'hidden' };
  const { source, suggestions } = response as { source?: unknown; suggestions?: unknown };
  if (source === 'empty') return { status: 'empty' };
  if (!Array.isArray(suggestions)) return { status: 'hidden' };

  const questions = suggestions
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_SUGGESTIONS);
  return questions.length > 0 ? { status: 'chips', suggestions: questions } : { status: 'hidden' };
};
