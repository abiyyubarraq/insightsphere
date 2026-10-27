import { assert, assertEquals } from "@std/assert";
import { type AnswerOptions, type ChatCompleter, OpenAILLMClient } from "./llmClient.ts";
import type { ChatCompletionRequest } from "./openaiClient.ts";

/** Records the request and returns the user message the model would read. */
async function userPrompt(options: AnswerOptions): Promise<string> {
  const requests: ChatCompletionRequest[] = [];
  const client: ChatCompleter = {
    generateChatCompletion: (request) => {
      requests.push(request);
      return Promise.resolve({
        answer: "ok",
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        model: "gpt-4o-mini",
      });
    },
  };

  await new OpenAILLMClient(client).generateAnswer("[doc_id: 1] Source: a.pdf\ntext", "Why?", options);

  assertEquals(requests.length, 1);
  const user = requests[0].messages.find((message) => message.role === "user");
  return typeof user?.content === "string" ? user.content : "";
}

// The model was never told how many sources it had, and cited 9 and 18 from
// five.
Deno.test("the answer prompt names the valid citation range", async () => {
  assert((await userPrompt({ sourceCount: 5 })).includes("Cite only doc_id 1 to 5."));
});

Deno.test("the answer prompt names a single source without a range", async () => {
  const prompt = await userPrompt({ sourceCount: 1 });
  assert(prompt.includes("Cite only doc_id 1."));
  assert(!prompt.includes("1 to 1"));
});

// The history has no markers now, and the model must not reach back for old
// numbers anyway.
Deno.test("with history the answer prompt says old source numbers do not apply", async () => {
  const withHistory = await userPrompt({
    sourceCount: 3,
    conversationHistory: "## Previous Conversation:\nUser: hi\n\nAssistant: hello",
  });
  assert(withHistory.includes("Earlier answers had their source numbers removed."));

  const withoutHistory = await userPrompt({ sourceCount: 3 });
  assert(!withoutHistory.includes("Earlier answers"));
});

// Summaries are cut at the start. Without this line the model fills the gaps
// with detail that is not in the context.
Deno.test("an overview answer is told the context is summaries", async () => {
  const overview = await userPrompt({ sourceCount: 2, overview: true });
  assert(overview.includes("one summary per document"));
  assert(overview.includes("Cite only doc_id 1 to 2."));

  assert(!(await userPrompt({ sourceCount: 2 })).includes("one summary per document"));
});
