import { describe, expect, it } from 'vitest';
import {
  AUTH_ERROR_MESSAGES,
  MIN_PASSWORD_LENGTH,
  classifyRecoverError,
  classifySignInError,
  classifySignUpError,
  classifyUpdatePasswordError,
  isValidEmail,
  validateNewPassword,
} from './authForms';

describe('checking the email before asking for a reset link', () => {
  // An empty field must not send a request to Supabase.
  it('rejects an empty email', () => {
    expect(isValidEmail('')).toBe(false);
  });

  // Spaces alone look filled in but are still empty.
  it('rejects an email made only of spaces', () => {
    expect(isValidEmail('   ')).toBe(false);
  });

  // A typo without @ would spend one of the few reset emails per hour.
  it('rejects an email with no @', () => {
    expect(isValidEmail('person.example.com')).toBe(false);
  });

  it('accepts a normal email', () => {
    expect(isValidEmail('person@example.com')).toBe(true);
  });

  // Mobile keyboards often add a space after the address.
  it('accepts a valid email with spaces around it', () => {
    expect(isValidEmail('  person@example.com ')).toBe(true);
  });
});

describe('checking a new password before saving it', () => {
  // Must match the signup rule, or a password signup refuses could be set here.
  it('rejects a password shorter than the minimum', () => {
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validateNewPassword(short, short)).toBe(
      `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    );
  });

  // An off-by-one here would refuse a password signup accepts.
  it('accepts a password of exactly the minimum length', () => {
    const exact = 'a'.repeat(MIN_PASSWORD_LENGTH);
    expect(validateNewPassword(exact, exact)).toBeNull();
  });

  // A typo in one field would lock the user out with a password they never meant.
  it('rejects two passwords that differ', () => {
    expect(validateNewPassword('secret-one', 'secret-two')).toBe('The passwords do not match.');
  });

  it('accepts two matching passwords', () => {
    expect(validateNewPassword('secret-one', 'secret-one')).toBeNull();
  });
});

describe('turning a reset-request error into what the user sees', () => {
  // The built-in mailer refuses known addresses outside the Supabase team but
  // answers 200 for unknown ones. Showing this error would reveal which
  // emails have accounts.
  it('treats email_address_not_authorized as success', () => {
    expect(classifyRecoverError({ status: 400, code: 'email_address_not_authorized' })).toBeNull();
  });

  // A real 429 only comes back for existing accounts. Showing it would tell
  // anyone which emails have an account.
  it('treats the email send rate limit as success', () => {
    expect(classifyRecoverError({ status: 429, code: 'over_email_send_rate_limit' })).toBeNull();
  });

  // Some rate limits come with a 429 and no code; same leak.
  it('treats any 429 as success', () => {
    expect(classifyRecoverError({ status: 429 })).toBeNull();
  });

  // Supabase validates the address only when it sends mail, so this code
  // appears for existing accounts only. An inline error would reveal them.
  it('treats email_address_invalid as success', () => {
    expect(classifyRecoverError({ status: 400, code: 'email_address_invalid' })).toBeNull();
  });

  // Anything else gets a generic sentence, never the raw Supabase message.
  it('reports any other error as unknown', () => {
    expect(classifyRecoverError({ status: 500, code: 'unexpected_failure' })).toBe('unknown');
    expect(classifyRecoverError({})).toBe('unknown');
  });

  // The success rules must not swallow real server failures.
  it('still reports a 500 with no code as unknown', () => {
    expect(classifyRecoverError({ status: 500 })).toBe('unknown');
  });
});

describe('turning a sign-in error into what the user sees', () => {
  // Raw Supabase wording ("Invalid login credentials") must not reach the screen.
  it('reports a wrong email or password', () => {
    expect(classifySignInError({ status: 400, code: 'invalid_credentials' })).toBe(
      'invalid_credentials'
    );
  });

  // Raw Supabase wording must not reach the screen; the user needs to know to confirm.
  it('reports an unconfirmed email', () => {
    expect(classifySignInError({ status: 400, code: 'email_not_confirmed' })).toBe(
      'email_not_confirmed'
    );
  });

  // Any other error gets the generic sentence, never the raw Supabase message.
  it('reports any other sign-in error as unknown', () => {
    expect(classifySignInError({ status: 500, code: 'unexpected_failure' })).toBe('unknown');
    expect(classifySignInError({})).toBe('unknown');
  });
});

describe('turning a password-update error into what the user sees', () => {
  it('reports reusing the current password', () => {
    expect(classifyUpdatePasswordError({ status: 422, code: 'same_password' })).toBe(
      'same_password'
    );
  });

  // The project may enforce a stronger rule than the 6 characters checked here.
  it('reports a password Supabase finds too weak', () => {
    expect(classifyUpdatePasswordError({ status: 422, code: 'weak_password' })).toBe(
      'weak_password'
    );
  });

  it('reports any other error as unknown', () => {
    expect(classifyUpdatePasswordError({ status: 401, code: 'session_not_found' })).toBe('unknown');
  });

  // The generic sentence must never carry Supabase's own wording.
  it('has a plain sentence for every kind', () => {
    expect(AUTH_ERROR_MESSAGES.unknown).toBe('Something went wrong. Please try again.');
    expect(AUTH_ERROR_MESSAGES.invalid_credentials).toBe('Email or password is wrong.');
    expect(AUTH_ERROR_MESSAGES.email_not_confirmed).toBe(
      'Confirm your email first, then sign in. Check your inbox for the link.'
    );
  });
});

describe('turning a sign-up error into what the user sees', () => {
  // Raw Supabase wording ("User already registered") must not reach the screen.
  it('reports an email that already has an account', () => {
    expect(classifySignUpError({ status: 422, code: 'user_already_exists' })).toBe('user_exists');
    expect(AUTH_ERROR_MESSAGES.user_exists).toBe(
      'An account with this email already exists. Sign in instead.'
    );
  });

  // The project may enforce a stronger rule than the 6 characters checked in the form.
  it('reports a password Supabase finds too weak', () => {
    expect(classifySignUpError({ status: 422, code: 'weak_password' })).toBe('weak_password');
  });

  it('reports an address Supabase refuses', () => {
    expect(classifySignUpError({ status: 400, code: 'email_address_invalid' })).toBe(
      'invalid_email'
    );
  });

  // Before this, signup put the Supabase message on screen as it came.
  it('reports any other error as unknown, even when it carries a raw message', () => {
    const raw = {
      status: 500,
      code: 'unexpected_failure',
      message: 'Database error saving new user',
    };
    expect(classifySignUpError(raw)).toBe('unknown');
    expect(classifySignUpError({})).toBe('unknown');
  });
});
