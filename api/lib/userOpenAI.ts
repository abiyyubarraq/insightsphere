import { OpenAIClient, openaiClient } from "./openaiClient.ts";
import { type ChosenClient, openAIFor } from "./openaiForUser.ts";
import { getUserOpenAIKey } from "./userApiKey.ts";

export function openAIForUser(userId: string): Promise<ChosenClient<OpenAIClient>> {
  return openAIFor(userId, {
    getKey: getUserOpenAIKey,
    makeClient: (key) => new OpenAIClient(key),
    serverClient: openaiClient,
  });
}
