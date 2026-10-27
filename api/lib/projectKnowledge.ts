/**
 * The project document lookups the question router and the overview path use.
 * Call only after userHasProjectAccess: the service-role client skips RLS.
 */

import { supabaseService } from "./supabaseClient.ts";
import type { ProjectKnowledge, RAGOpenAI } from "./ragService.ts";
import {
  createSuggestionCache,
  getSuggestions,
  SUGGESTION_MAX_TOKENS,
  SUGGESTION_MODEL,
  SUGGESTION_TEMPERATURE,
} from "./suggestions.ts";

/**
 * One per API process; it starts empty after every deploy. Shared by the
 * suggestions endpoint and the off-topic reply, so both show the same questions
 * for one model call.
 */
export const suggestionCache = createSuggestionCache();

/** The client is the one the request already chose; it is never stored. */
export function knowledgeFor(
  projectId: string,
  client: Pick<RAGOpenAI, "generateChatCompletion">,
): ProjectKnowledge {
  const loadSummaries = (ids: string[]) =>
    supabaseService.getDocumentSummaries(projectId, ids);

  return {
    listDocuments: () => supabaseService.getReadyDocuments(projectId),
    loadSummaries,
    suggestions: async (docs) => {
      const { suggestions } = await getSuggestions(
        projectId,
        docs,
        async (messages, signal) => {
          const result = await client.generateChatCompletion({
            model: SUGGESTION_MODEL,
            messages,
            max_tokens: SUGGESTION_MAX_TOKENS,
            temperature: SUGGESTION_TEMPERATURE,
            signal,
          });
          return result.answer;
        },
        suggestionCache,
        { loadSummaries },
      );
      return suggestions;
    },
  };
}
