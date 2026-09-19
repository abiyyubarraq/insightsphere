/**
 * Rewrite a follow-up question into one that stands on its own, so retrieval
 * has something to search for.
 *
 * Retrieval used to embed the raw user message. Conversation history was built
 * and handed to the answer step only, never to the search. Measured on the real
 * corpus: "What causes hallucination in large language models?" returned 5
 * chunks at 0.684, and "and what about the second one?" returned nothing above
 * the 0.3 threshold — so the second turn of every conversation was answered
 * with "I don't have enough relevant information".
 *
 * The completion call is a parameter rather than an import so this module stays
 * free of the OpenAI singleton and can be tested.
 */

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface RewriteMessage {
  role: "system" | "user";
  content: string;
}

export type CompleteRewrite = (
  messages: RewriteMessage[],
  signal: AbortSignal,
) => Promise<string>;

export const REWRITE_MODEL = "gpt-4o-mini";
export const REWRITE_MAX_TOKENS = 80;
export const REWRITE_TIMEOUT_MS = 1500;
/** A rewrite longer than this multiple of the question has stopped rewriting
 * and started answering. */
export const REWRITE_MAX_GROWTH = 3;
/** Two user turns and two assistant turns. More context makes the rewrite drift
 * towards whatever the conversation was about earlier. */
export const REWRITE_TURNS = 4;
export const REWRITE_ASSISTANT_CHARS = 200;

/**
 * No follow-up detector on purpose. A feature-based gate that decides whether a
 * question needs rewriting scores AUC 0.593 — not meaningfully better than
 * never rewriting — against an oracle ceiling of +3pp, so it adds a thing that
 * can be wrong for no measurable gain. The instruction to leave a
 * self-contained question alone goes in the prompt instead, which is what
 * LangChain's create_history_aware_retriever and LlamaIndex's
 * CondenseQuestionChatEngine both do.
 *
 * The second paragraph is the expensive half. Left to itself the model expands
 * vocabulary — adds topic words the user never used — and that costs 9% nDCG@10
 * on FiQA. This corpus is research papers, where an author surname or a figure
 * is often the only thing that will match.
 */
const REWRITE_SYSTEM_PROMPT = [
  "Given a chat history and the latest user question which might reference " +
  "context in the chat history, formulate a standalone question which can be " +
  "understood without the chat history. Do NOT answer the question, just " +
  "reformulate it if needed and otherwise return it as is.",
  "",
  "Keep author names, technical terms, figures and numbers exactly as the user " +
  "wrote them. Do not add topic words the user did not use.",
].join("\n");

/**
 * The last few turns, with assistant answers cut short. A full answer is
 * hundreds of words and would dominate the prompt; its opening sentences carry
 * the referents a follow-up points back at.
 */
export function selectRewriteTurns(turns: HistoryTurn[]): HistoryTurn[] {
  return turns
    .slice(-REWRITE_TURNS)
    .map((turn) =>
      turn.role === "assistant" && turn.content.length > REWRITE_ASSISTANT_CHARS
        ? { ...turn, content: turn.content.slice(0, REWRITE_ASSISTANT_CHARS) }
        : turn
    );
}

export function buildRewriteMessages(
  turns: HistoryTurn[],
  query: string,
): RewriteMessage[] {
  const history = turns
    .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.content}`)
    .join("\n");

  return [
    { role: "system", content: REWRITE_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Chat history:\n${history}\n\nLatest question: ${query}`,
    },
  ];
}

/**
 * Take the rewrite, or keep the original. Empty output and a rewrite that has
 * grown past REWRITE_MAX_GROWTH are both signs the model answered the question
 * instead of restating it, and an answer makes a far worse search query than
 * the question did.
 */
export function acceptRewrite(
  original: string,
  candidate: string | null | undefined,
): string {
  const rewritten = candidate?.trim() ?? "";
  if (!rewritten) return original;
  if (rewritten.length > original.trim().length * REWRITE_MAX_GROWTH) {
    return original;
  }
  return rewritten;
}

/**
 * With no history this returns immediately and makes no network call, so the
 * first turn of a conversation is exactly as fast as it was before.
 *
 * Every other failure — timeout, a thrown error, an unusable rewrite — falls
 * back to the original query. A rewrite that does not work must never turn into
 * a request that does not work.
 */
export async function contextualiseQuery(
  query: string,
  turns: HistoryTurn[],
  complete: CompleteRewrite,
  options: { timeoutMs?: number } = {},
): Promise<{ searchQuery: string; rewritten: boolean }> {
  const recent = selectRewriteTurns(turns);
  if (recent.length === 0) return { searchQuery: query, rewritten: false };

  const { timeoutMs = REWRITE_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`rewrite exceeded ${timeoutMs}ms`)),
    timeoutMs,
  );

  // Raced rather than left to the abort signal alone: the guard has to hold
  // even if the completion never looks at the signal it was handed.
  const deadline = new Promise<never>((_, reject) => {
    controller.signal.addEventListener(
      "abort",
      () => reject(controller.signal.reason),
      { once: true },
    );
  });

  try {
    const raw = await Promise.race([
      complete(buildRewriteMessages(recent, query), controller.signal),
      deadline,
    ]);
    const searchQuery = acceptRewrite(query, raw);
    return { searchQuery, rewritten: searchQuery !== query };
  } catch (error) {
    console.warn(
      `Query rewrite failed, searching with the original question: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return { searchQuery: query, rewritten: false };
  } finally {
    clearTimeout(timer);
  }
}
