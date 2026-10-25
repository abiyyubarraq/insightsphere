import OpenAI from "openai";
import { EMBEDDING_MODEL } from "../../lib/constants.ts";
import {
  deleteKeyRow,
  getKeyRow,
  keySecret,
  saveKeyRow,
} from "../../lib/userApiKey.ts";
import { createApiKeyRoutes } from "./apiKeyRoutes.ts";

export const KEY_CHECK_TIMEOUT_MS = 10_000;

export const { getApiKey, putApiKey, deleteApiKey } = createApiKeyRoutes({
  secret: keySecret,
  store: { getKeyRow, saveKeyRow, deleteKeyRow },
  // One tiny embedding call, on the model the documents are embedded with.
  // No retries: a slow or failing check answers 502 and nothing is saved.
  verifyKey: async (apiKey) => {
    const client = new OpenAI({
      apiKey,
      timeout: KEY_CHECK_TIMEOUT_MS,
      maxRetries: 0,
    });
    await client.embeddings.create({ model: EMBEDDING_MODEL, input: "key check" });
  },
});
