/**
 * Which OpenAI client a request runs on. Pure: the real key lookup and client
 * are passed in by userOpenAI.ts.
 */

export interface OpenAIForDeps<C> {
  getKey(userId: string): Promise<string | null>;
  makeClient(key: string): C;
  serverClient: C;
}

export interface ChosenClient<C> {
  client: C;
  /** True only when the client was built from the user's own key. */
  own: boolean;
}

/**
 * Looked up on every request and never cached, so a removed key stops being
 * used at once.
 */
export async function openAIFor<C>(
  userId: string,
  deps: OpenAIForDeps<C>,
): Promise<ChosenClient<C>> {
  const key = await deps.getKey(userId);
  // An empty string must not reach the client: OpenAIClient reads the server
  // key from the environment when it is given none, which would skip quotas
  // while spending the server's credit.
  if (!key) return { client: deps.serverClient, own: false };
  return { client: deps.makeClient(key), own: true };
}
