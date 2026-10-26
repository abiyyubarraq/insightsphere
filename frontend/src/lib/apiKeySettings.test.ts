import { describe, expect, it } from 'vitest';
import {
  GENERIC_KEY_ERROR,
  NOT_ENABLED,
  OPENAI_UNREACHABLE,
  describeKeyError,
  formatSavedDate,
  keyStatusLine,
  savedKeyMessage,
} from './apiKeySettings';

const apiError = (message: string, status: number) => Object.assign(new Error(message), { status });

describe('turning a settings API failure into the text on the page', () => {
  // The API explains a bad or rejected key in a sentence; hiding it behind a
  // generic text leaves the user guessing what to fix.
  it('shows the API sentence for a 400', () => {
    const view = describeKeyError(apiError('OpenAI rejected this key.', 400));
    expect(view).toEqual({ message: 'OpenAI rejected this key.', disabled: false });
  });

  // A burst limit is temporary, so the form must stay usable.
  it('shows the API sentence for a 429 and keeps the form enabled', () => {
    const view = describeKeyError(apiError('Too many requests. Wait a minute.', 429));
    expect(view).toEqual({ message: 'Too many requests. Wait a minute.', disabled: false });
  });

  // The API's 502 text is long; the page shows one short fixed sentence.
  it('shows a fixed sentence for a 502', () => {
    const view = describeKeyError(apiError('OpenAI did not answer the key check in time.', 502));
    expect(view).toEqual({ message: OPENAI_UNREACHABLE, disabled: false });
    expect(OPENAI_UNREACHABLE).toBe('Could not reach OpenAI. Try again.');
  });

  // With the feature off on the server, every try would fail the same way.
  it('disables the form for a 503', () => {
    const view = describeKeyError(apiError('anything', 503));
    expect(view).toEqual({ message: NOT_ENABLED, disabled: true });
    expect(NOT_ENABLED).toBe('Own API keys are not enabled on this server.');
  });

  // A network failure arrives as a plain Error whose message already says what happened.
  it('shows the message of a plain network error', () => {
    const view = describeKeyError(
      new Error('Could not reach the server. Check your connection and try again.')
    );
    expect(view).toEqual({
      message: 'Could not reach the server. Check your connection and try again.',
      disabled: false,
    });
  });

  // A server crash text is not meant for users.
  it('shows a generic sentence for a 500', () => {
    expect(describeKeyError(apiError('TypeError: x is undefined', 500))).toEqual({
      message: GENERIC_KEY_ERROR,
      disabled: false,
    });
  });

  it('shows a generic sentence for something that is not an Error', () => {
    expect(describeKeyError('boom')).toEqual({ message: GENERIC_KEY_ERROR, disabled: false });
  });
});

describe('the line that says which key answers are paid with', () => {
  it('says there are no daily limits with an own key', () => {
    expect(keyStatusLine(true)).toBe('Daily limits: none, your key is used');
  });

  it('says the shared key is used without one', () => {
    expect(keyStatusLine(false)).toBe('Using the shared key, daily limits apply');
  });
});

describe('showing when the key was saved', () => {
  // Midday UTC, so the date is the same in every time zone the test runs in.
  it('formats a valid timestamp as a readable date', () => {
    expect(formatSavedDate('2026-10-26T12:00:00.000Z', 'en-GB')).toBe('26 Oct 2026');
  });

  // "Invalid Date" on the page looks broken; showing no date is better.
  it('returns null for an invalid timestamp', () => {
    expect(formatSavedDate('not a date', 'en-GB')).toBeNull();
  });

  it('returns null when there is no timestamp', () => {
    expect(formatSavedDate(null, 'en-GB')).toBeNull();
  });
});

describe('the message after a save', () => {
  it('shows the hint, never more of the key', () => {
    expect(savedKeyMessage('sk-…abcd')).toBe('Key saved · sk-…abcd');
  });
});
