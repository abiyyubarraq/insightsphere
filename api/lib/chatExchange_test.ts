import { assertEquals, assertRejects } from "@std/assert";
import { answerThenSave, type ExchangeSteps } from "./chatExchange.ts";

interface Message {
  id: string;
}

/** Records every step in order, so a test can assert what was saved. */
const steps = (fail: { answer?: boolean; saveAssistant?: boolean } = {}) => {
  const log: string[] = [];
  const exchange: ExchangeSteps<string, Message> = {
    answer: () => {
      log.push("answer");
      return fail.answer ? Promise.reject(new Error("key rejected")) : Promise.resolve("the answer");
    },
    saveUser: () => {
      log.push("saveUser");
      return Promise.resolve({ id: "u1" });
    },
    saveAssistant: (answer) => {
      log.push(`saveAssistant:${answer}`);
      return fail.saveAssistant
        ? Promise.reject(new Error("insert failed"))
        : Promise.resolve({ id: "a1" });
    },
    deleteMessage: (message) => {
      log.push(`delete:${message.id}`);
      return Promise.resolve();
    },
  };
  return { exchange, log };
};

// A rejected own key left a lonely question in the history after a reload.
Deno.test("a failed answer saves nothing", async () => {
  const { exchange, log } = steps({ answer: true });

  await assertRejects(() => answerThenSave(exchange), Error, "key rejected");

  assertEquals(log, ["answer"]);
});

// The question is saved first, so the answer failing to save must take it out again.
Deno.test("a failed answer save removes the question again", async () => {
  const { exchange, log } = steps({ saveAssistant: true });

  await assertRejects(() => answerThenSave(exchange), Error, "insert failed");

  assertEquals(log, ["answer", "saveUser", "saveAssistant:the answer", "delete:u1"]);
});

// History is ordered by created_at, so the question must be written before the answer.
Deno.test("a good answer saves the question, then the answer", async () => {
  const { exchange, log } = steps();

  const out = await answerThenSave(exchange);

  assertEquals(log, ["answer", "saveUser", "saveAssistant:the answer"]);
  assertEquals(out, {
    answer: "the answer",
    userMessage: { id: "u1" },
    assistantMessage: { id: "a1" },
  });
});
