import { assertEquals, assertRejects } from "@std/assert";
import { answerThenSave, type ExchangeSteps } from "./chatExchange.ts";

interface Message {
  id: string;
}

/** Records every step in order, so a test can assert what was saved. */
const steps = (
  fail: { answer?: boolean; saveAssistant?: boolean } = {},
  conversationId?: string,
) => {
  const log: string[] = [];
  const exchange: ExchangeSteps<string, Message> = {
    conversationId,
    answer: () => {
      log.push("answer");
      return fail.answer ? Promise.reject(new Error("key rejected")) : Promise.resolve("the answer");
    },
    ensureConversation: () => {
      log.push("ensureConversation");
      return Promise.resolve("c-new");
    },
    saveUser: (id) => {
      log.push(`saveUser:${id}`);
      return Promise.resolve({ id: "u1" });
    },
    saveAssistant: (id, answer) => {
      log.push(`saveAssistant:${id}:${answer}`);
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

// A rejected own key left a lonely question in the history after a reload,
// and on a first chat it also left an empty conversation row.
Deno.test("a failed answer saves nothing and creates no conversation", async () => {
  const { exchange, log } = steps({ answer: true });

  await assertRejects(() => answerThenSave(exchange), Error, "key rejected");

  assertEquals(log, ["answer"]);
});

// The question is saved first, so the answer failing to save must take it out again.
Deno.test("a failed answer save removes the question again", async () => {
  const { exchange, log } = steps({ saveAssistant: true }, "c1");

  await assertRejects(() => answerThenSave(exchange), Error, "insert failed");

  assertEquals(log, ["answer", "saveUser:c1", "saveAssistant:c1:the answer", "delete:u1"]);
});

// History is ordered by created_at, so the question must be written before the answer.
Deno.test("a good answer saves the question, then the answer", async () => {
  const { exchange, log } = steps({}, "c1");

  const out = await answerThenSave(exchange);

  assertEquals(log, ["answer", "saveUser:c1", "saveAssistant:c1:the answer"]);
  assertEquals(out, {
    answer: "the answer",
    conversationId: "c1",
    userMessage: { id: "u1" },
    assistantMessage: { id: "a1" },
  });
});

// The conversation row used to be created before the answer, so it must now
// come after the answer and before the messages that point to it.
Deno.test("a good first answer creates the conversation, then saves into it", async () => {
  const { exchange, log } = steps();

  const out = await answerThenSave(exchange);

  assertEquals(log, [
    "answer",
    "ensureConversation",
    "saveUser:c-new",
    "saveAssistant:c-new:the answer",
  ]);
  assertEquals(out.conversationId, "c-new");
});

// A conversation that already exists must be reused, never created again.
Deno.test("an existing conversation is used without creating one", async () => {
  const { exchange, log } = steps({}, "c1");

  await answerThenSave(exchange);

  assertEquals(log.includes("ensureConversation"), false);
});
