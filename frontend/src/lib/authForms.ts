/** Same rule as the signup page. */
export const MIN_PASSWORD_LENGTH = 6;

export type AuthErrorKind =
  | 'invalid_email'
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'same_password'
  | 'weak_password'
  | 'user_exists'
  | 'unknown';

export const AUTH_ERROR_MESSAGES: Record<AuthErrorKind, string> = {
  invalid_email: 'Enter a valid email address.',
  invalid_credentials: 'Email or password is wrong.',
  email_not_confirmed: 'Confirm your email first, then sign in. Check your inbox for the link.',
  same_password: 'Choose a password different from your current one.',
  weak_password: 'That password is too weak. Try a longer one.',
  user_exists: 'An account with this email already exists. Sign in instead.',
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
  // Supabase only checks the address and the send limit when it really sends
  // mail, so these signals (the two codes and a 429) come back for existing
  // accounts and never for unknown emails (those get 200). Showing any of them
  // would tell anyone which emails have an account. The address shape is
  // already checked in the browser before the request.
  if (
    error.status === 429 ||
    error.code === 'over_email_send_rate_limit' ||
    error.code === 'email_address_not_authorized' ||
    error.code === 'email_address_invalid'
  ) {
    return null;
  }
  return 'unknown';
};

export const classifySignInError = (error: AuthErrorLike): AuthErrorKind => {
  if (error.code === 'invalid_credentials') return 'invalid_credentials';
  if (error.code === 'email_not_confirmed') return 'email_not_confirmed';
  return 'unknown';
};

// With "Confirm email" on, Supabase answers an existing email like a new one, so
// user_already_exists only comes back when that setting is off.
export const classifySignUpError = (error: AuthErrorLike): AuthErrorKind => {
  if (error.code === 'user_already_exists') return 'user_exists';
  if (error.code === 'weak_password') return 'weak_password';
  if (error.code === 'email_address_invalid') return 'invalid_email';
  return 'unknown';
};

export const classifyUpdatePasswordError = (error: AuthErrorLike): AuthErrorKind => {
  if (error.code === 'same_password') return 'same_password';
  if (error.code === 'weak_password') return 'weak_password';
  return 'unknown';
};
