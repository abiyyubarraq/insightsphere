/** Same rule as the signup page. */
export const MIN_PASSWORD_LENGTH = 6;

export type AuthErrorKind =
  | 'rate_limited'
  | 'invalid_email'
  | 'same_password'
  | 'weak_password'
  | 'unknown';

export const AUTH_ERROR_MESSAGES: Record<AuthErrorKind, string> = {
  rate_limited: 'Too many reset emails. Wait a few minutes and try again.',
  invalid_email: 'Enter a valid email address.',
  same_password: 'Choose a password different from your current one.',
  weak_password: 'That password is too weak. Try a longer one.',
  unknown: 'Something went wrong. Please try again.',
};

/** Carries only a safe, user-facing message; the Supabase message is dropped. */
export class AuthFormError extends Error {
  constructor(readonly kind: AuthErrorKind) {
    super(AUTH_ERROR_MESSAGES[kind]);
  }
}

interface AuthErrorLike {
  status?: number;
  code?: string;
}

export const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

export const validateNewPassword = (password: string, confirm: string): string | null => {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirm) return 'The passwords do not match.';
  return null;
};

/** Returns null when the request should be shown as sent. */
export const classifyRecoverError = (error: AuthErrorLike): AuthErrorKind | null => {
  // Supabase only checks the address when it really sends mail, so these two
  // codes come back for existing accounts and never for unknown emails (those
  // get 200). Showing either would tell anyone which emails have an account.
  // The address shape is already checked in the browser before the request.
  if (error.code === 'email_address_not_authorized' || error.code === 'email_address_invalid') {
    return null;
  }
  if (error.status === 429 || error.code === 'over_email_send_rate_limit') return 'rate_limited';
  return 'unknown';
};

export const classifyUpdatePasswordError = (error: AuthErrorLike): AuthErrorKind => {
  if (error.code === 'same_password') return 'same_password';
  if (error.code === 'weak_password') return 'weak_password';
  return 'unknown';
};
