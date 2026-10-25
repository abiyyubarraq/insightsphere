import { describe, expect, it } from 'vitest';
import {
  AUTH_ERROR_MESSAGES,
  MIN_PASSWORD_LENGTH,
  classifyRecoverError,
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

  // The raw rate-limit message is technical; the user needs to know to wait.
  it('reports the email send rate limit as rate limited', () => {
    expect(classifyRecoverError({ status: 429, code: 'over_email_send_rate_limit' })).toBe(
      'rate_limited'
    );
  });

  // Some rate limits come with a 429 and no code.
  it('reports any 429 as rate limited', () => {
    expect(classifyRecoverError({ status: 429 })).toBe('rate_limited');
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
    expect(AUTH_ERROR_MESSAGES.rate_limited).toBe(
      'Too many reset emails. Wait a few minutes and try again.'
    );
  });
});
