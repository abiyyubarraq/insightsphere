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
