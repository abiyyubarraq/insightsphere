export interface ComposerKey {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  keyCode: number;
}

/** keyCode 229 is how Safari reports an Enter that confirms an input-method word. */
const IME_KEY_CODE = 229;

export const shouldSubmitOnKey = ({ key, shiftKey, isComposing, keyCode }: ComposerKey): boolean =>
  key === 'Enter' && !shiftKey && !isComposing && keyCode !== IME_KEY_CODE;

export const canSend = (text: string, busy: boolean): boolean => !busy && text.trim().length > 0;

/**
 * A history reply replaces the whole message list, so sending waits for it:
 * otherwise the reply could drop a send's temporary messages, and the send's
 * own reply would then be added a second time.
 */
export const isComposerBusy = (chatLoading: boolean, loadingHistory: boolean): boolean =>
  chatLoading || loadingHistory;
