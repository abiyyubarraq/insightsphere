import { describe, expect, it } from 'vitest';
import { signOutThisBrowser, type SignOutClient } from './signOut';

describe('signing out', () => {
  // signOut() with no scope is global: signing out on a phone also signed the
  // user out on their laptop.
  it('asks Supabase to end only this browser session', async () => {
    const calls: unknown[] = [];
    const client: SignOutClient = {
      auth: {
        signOut: async (options) => {
          calls.push(options);
          return { error: null };
        },
      },
    };

    await signOutThisBrowser(client);

    expect(calls).toEqual([{ scope: 'local' }]);
  });

  it('passes the Supabase error back to the caller', async () => {
    const client: SignOutClient = {
      auth: { signOut: async () => ({ error: { message: 'network down' } }) },
    };

    expect(await signOutThisBrowser(client)).toEqual({ error: { message: 'network down' } });
  });
});
