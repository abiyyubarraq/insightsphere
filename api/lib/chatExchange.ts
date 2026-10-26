/**
 * Saves a question only together with its answer. The question used to be
 * saved before the answer was made, so a failed answer (a rejected own key,
 * an outage) left a question with no reply in the history.
 *
 * Pure: the answer and the saves are passed in, so this can be tested.
 */

export interface ExchangeSteps<A, M> {
  answer(): Promise<A>;
  saveUser(): Promise<M>;
  saveAssistant(answer: A): Promise<M>;
  deleteMessage(message: M): Promise<void>;
}

export async function answerThenSave<A, M>(
  steps: ExchangeSteps<A, M>,
): Promise<{ answer: A; userMessage: M; assistantMessage: M }> {
  const answer = await steps.answer();
  const userMessage = await steps.saveUser();
  try {
    const assistantMessage = await steps.saveAssistant(answer);
    return { answer, userMessage, assistantMessage };
  } catch (error) {
    try {
      await steps.deleteMessage(userMessage);
    } catch (cleanupError) {
      console.error("Could not remove the unanswered question:", cleanupError);
    }
    throw error;
  }
}
