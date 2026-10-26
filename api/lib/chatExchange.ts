/**
 * Saves a question only together with its answer. The question used to be
 * saved before the answer was made, so a failed answer (a rejected own key,
 * an outage) left a question with no reply in the history.
 *
 * A new conversation is created only after the answer exists, for the same
 * reason: a failed first answer used to leave an empty conversation row.
 *
 * Pure: the answer and the saves are passed in, so this can be tested.
 */

export interface ExchangeSteps<A, M> {
  /** Set when the conversation already exists. */
  conversationId?: string;
  answer(): Promise<A>;
  /** Called only after a good answer, and only when conversationId is not set. */
  ensureConversation(): Promise<string>;
  saveUser(conversationId: string): Promise<M>;
  saveAssistant(conversationId: string, answer: A): Promise<M>;
  deleteMessage(message: M): Promise<void>;
}

export async function answerThenSave<A, M>(
  steps: ExchangeSteps<A, M>,
): Promise<{ answer: A; conversationId: string; userMessage: M; assistantMessage: M }> {
  const answer = await steps.answer();
  const conversationId = steps.conversationId ?? await steps.ensureConversation();
  const userMessage = await steps.saveUser(conversationId);
  try {
    const assistantMessage = await steps.saveAssistant(conversationId, answer);
    return { answer, conversationId, userMessage, assistantMessage };
  } catch (error) {
    try {
      await steps.deleteMessage(userMessage);
    } catch (cleanupError) {
      console.error("Could not remove the unanswered question:", cleanupError);
    }
    throw error;
  }
}
