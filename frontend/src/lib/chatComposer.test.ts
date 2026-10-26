import { describe, expect, it } from 'vitest';
import { canSend, isComposerBusy, shouldSubmitOnKey } from './chatComposer';

const key = (overrides: Partial<Parameters<typeof shouldSubmitOnKey>[0]> = {}) => ({
  key: 'Enter',
  shiftKey: false,
  isComposing: false,
  keyCode: 13,
  ...overrides,
});

describe('deciding when a key press sends the message', () => {
  // Enter is the only way most people send; it must work without the mouse.
  it('sends on Enter', () => {
    expect(shouldSubmitOnKey(key())).toBe(true);
  });

  // Shift+Enter is how a multi-line question is written. Sending here cuts
  // the question off half-way.
  it('does not send on Shift+Enter', () => {
    expect(shouldSubmitOnKey(key({ shiftKey: true }))).toBe(false);
  });

  // Indonesian, Japanese and Chinese input methods use Enter to confirm a
  // word. Sending then posts a half-typed question.
  it('does not send while an input method is composing', () => {
    expect(shouldSubmitOnKey(key({ isComposing: true }))).toBe(false);
  });

  // Safari reports the confirming Enter with isComposing false but keyCode
  // 229, so the composing flag alone is not enough there.
  it('does not send on the Safari composing key code', () => {
    expect(shouldSubmitOnKey(key({ keyCode: 229 }))).toBe(false);
  });

  it('does not send on other keys', () => {
    expect(shouldSubmitOnKey(key({ key: 'a', keyCode: 65 }))).toBe(false);
  });
});

describe('deciding when the send button is enabled', () => {
  // An empty question still costs a request and a quota slot on the API.
  it('refuses empty and whitespace-only text', () => {
    expect(canSend('', false)).toBe(false);
    expect(canSend('   \n', false)).toBe(false);
  });

  // A second send while one is pending would race the first answer.
  it('refuses while an answer is pending', () => {
    expect(canSend('hello', true)).toBe(false);
  });

  it('accepts text when idle', () => {
    expect(canSend('hello', false)).toBe(true);
  });
});

describe('deciding when the composer is busy', () => {
  // A send during the first history load after a project switch was followed
  // by the history reply replacing the list, then the send reply was added again.
  it('is busy while the history loads, even with no answer pending', () => {
    expect(isComposerBusy(false, true)).toBe(true);
    expect(canSend('hello', isComposerBusy(false, true))).toBe(false);
  });

  it('is busy while an answer is pending', () => {
    expect(isComposerBusy(true, false)).toBe(true);
  });

  it('is free when nothing is pending', () => {
    expect(isComposerBusy(false, false)).toBe(false);
  });
});
