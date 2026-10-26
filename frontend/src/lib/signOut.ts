/** Kept this narrow so a test can pass a plain object instead of a Supabase client. */
export interface SignOutClient {
  auth: {
    signOut(options: { scope: 'local' }): Promise<{ error: { message: string } | null }>;
  };
}

/**
 * Ends the session in this browser only. The default scope is global, which
 * also revoked the refresh tokens of every other device the user was signed in on.
 */
export const signOutThisBrowser = (client: SignOutClient) =>
  client.auth.signOut({ scope: 'local' });
