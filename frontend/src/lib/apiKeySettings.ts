// Kept apart from services/supabase.ts, which builds the Supabase client on
// import and so cannot be loaded by the unit tests.

export const NOT_ENABLED = 'Own API keys are not enabled on this server.';
export const OPENAI_UNREACHABLE = 'Could not reach OpenAI. Try again.';
export const GENERIC_KEY_ERROR = 'Something went wrong. Try again.';

export interface KeyErrorView {
  message: string;
  disabled: boolean;
}

const statusOf = (error: unknown): number | null =>
  error instanceof Error && 'status' in error && typeof error.status === 'number'
    ? error.status
    : null;

export function describeKeyError(error: unknown): KeyErrorView {
  const status = statusOf(error);
  if (status === 503) return { message: NOT_ENABLED, disabled: true };
  if (status === 502) return { message: OPENAI_UNREACHABLE, disabled: false };
  if ((status === 400 || status === 429) && error instanceof Error) {
    return { message: error.message, disabled: false };
  }
  // No status: the request never got an answer, and the message says why.
  if (status === null && error instanceof Error) {
    return { message: error.message, disabled: false };
  }
  return { message: GENERIC_KEY_ERROR, disabled: false };
}

export const keyStatusLine = (hasKey: boolean): string =>
  hasKey ? 'Daily limits: none, your key is used' : 'Using the shared key, daily limits apply';

export const savedKeyMessage = (hint: string): string => `Key saved · ${hint}`;

export function formatSavedDate(iso: string | null, locale?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}
