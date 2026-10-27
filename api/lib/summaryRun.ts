/**
 * The paid part of a summary request, run inside chargeThenRun. Pure: the
 * OpenAI call and the save come in as functions.
 */

import { OpenAIEmptyReplyError } from "./openaiErrors.ts";

export interface SummaryRunDeps {
  generate(): Promise<{ answer: string }>;
  save(summary: string): Promise<void>;
}

/**
 * Calls `billed` as soon as OpenAI has answered, even with no choices or an
 * empty answer, so a later failure keeps the charge and regenerate cannot loop
 * for free. Returns the summary length.
 */
export async function runSummary(
  deps: SummaryRunDeps,
  billed: () => void,
): Promise<number> {
  let result: { answer: string };
  try {
    result = await deps.generate();
  } catch (error) {
    if (error instanceof OpenAIEmptyReplyError) billed();
    throw error;
  }
  billed();
  if (!result.answer.trim()) throw new Error("The model returned an empty summary");
  await deps.save(result.answer);
  return result.answer.length;
}
