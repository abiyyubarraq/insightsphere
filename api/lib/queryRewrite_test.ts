import { assertEquals } from "@std/assert";
import {
  acceptRewrite,
  buildRewriteMessages,
  type CompleteRewrite,
  contextualiseQuery,
  type HistoryTurn,
  REWRITE_ASSISTANT_CHARS,
  REWRITE_TURNS,
  selectRewriteTurns,
} from "./queryRewrite.ts";

const turns = (count: number): HistoryTurn[] =>
  Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `turn ${i}`,
  }));

const history: HistoryTurn[] = [
  { role: "user", content: "What causes hallucination in large language models?" },
  { role: "assistant", content: "Three causes are described: exposure bias, ..." },
];

/** Records what it was asked, so a test can assert it was never called. */
const spy = (answer: string) => {
  const calls: unknown[][] = [];
  const complete: CompleteRewrite = (messages) => {
    calls.push(messages);
    return Promise.resolve(answer);
  };
  return { complete, calls };
};

// The first turn of a conversation has no history, so there is nothing to
// resolve and no reason to pay for a round trip. Retrieval on turn one must be
// exactly as fast as it was before any of this existed.
Deno.test("no history means no rewrite call at all", async () => {
  const { complete, calls } = spy("should never be used");

  const out = await contextualiseQuery("What is N-BEATS?", [], complete);

  assertEquals(out.searchQuery, "What is N-BEATS?");
  assertEquals(out.rewritten, false);
  assertEquals(calls.length, 0);
});

// Retrieval used to embed the raw message, so "and what about the second one?"
// searched for those words and returned nothing above threshold.
Deno.test("a follow-up is rewritten into a question that stands alone", async () => {
  const { complete } = spy("What is the second cause of hallucination in large language models?");

  const out = await contextualiseQuery("and what about the second one?", history, complete);

  assertEquals(
    out.searchQuery,
    "What is the second cause of hallucination in large language models?",
  );
  assertEquals(out.rewritten, true);
});

// A rewrite that fails must never take the request down with it. Every path
// below falls back to searching for what the user actually typed.
Deno.test("a thrown error falls back to the original query", async () => {
  const complete: CompleteRewrite = () => Promise.reject(new Error("502 from upstream"));

  const out = await contextualiseQuery("and the second one?", history, complete);

  assertEquals(out.searchQuery, "and the second one?");
  assertEquals(out.rewritten, false);
});

Deno.test("a completion that never returns falls back once the deadline passes", async () => {
  const complete: CompleteRewrite = () => new Promise<string>(() => {});

  const out = await contextualiseQuery("and the second one?", history, complete, {
    timeoutMs: 20,
  });

  assertEquals(out.searchQuery, "and the second one?");
  assertEquals(out.rewritten, false);
});

Deno.test("empty or blank output falls back to the original query", async () => {
  for (const answer of ["", "   ", "\n\n"]) {
    const { complete } = spy(answer);
    const out = await contextualiseQuery("and the second one?", history, complete);
    assertEquals(out.searchQuery, "and the second one?");
    assertEquals(out.rewritten, false);
  }
});

// Past three times the length the model has stopped reformulating and started
// answering, and an answer is a worse search query than the question was.
Deno.test("a rewrite more than three times the length is discarded", async () => {
  const question = "and the second one?";
  const { complete } = spy("x".repeat(question.length * 3 + 1));

  const out = await contextualiseQuery(question, history, complete);

  assertEquals(out.searchQuery, question);
  assertEquals(out.rewritten, false);
});

Deno.test("a rewrite just inside the length limit is accepted", () => {
  const question = "and the second one?";
  const candidate = "y".repeat(question.length * 3);
  assertEquals(acceptRewrite(question, candidate), candidate);
});

Deno.test("null and undefined candidates fall back", () => {
  assertEquals(acceptRewrite("original", null), "original");
  assertEquals(acceptRewrite("original", undefined), "original");
});

// Only the last two exchanges are used. More history makes the rewrite drift
// towards whatever the conversation was about earlier.
Deno.test("only the last four turns are used", () => {
  const selected = selectRewriteTurns(turns(10));

  assertEquals(selected.length, REWRITE_TURNS);
  assertEquals(selected[0].content, "turn 6");
  assertEquals(selected[3].content, "turn 9");
});

// A full answer is hundreds of words and would dominate the prompt; its opening
// sentences carry the referents a follow-up points back at.
Deno.test("assistant turns are cut short, user turns are not", () => {
  const long = "a".repeat(500);
  const selected = selectRewriteTurns([
    { role: "user", content: long },
    { role: "assistant", content: long },
  ]);

  assertEquals(selected[0].content.length, 500);
  assertEquals(selected[1].content.length, REWRITE_ASSISTANT_CHARS);
});

// Without this line the model expands vocabulary, which measured at -9% nDCG@10
// on FiQA. On a corpus of research papers an author surname is often the only
// thing that will match.
Deno.test("the prompt forbids adding words the user did not use", () => {
  const messages = buildRewriteMessages(history, "and the second one?");

  assertEquals(messages[0].role, "system");
  assertEquals(
    messages[0].content.includes("Do not add topic words the user did not use."),
    true,
  );
  assertEquals(
    messages[0].content.includes("Do NOT answer the question"),
    true,
  );
  assertEquals(messages[1].content.includes("and the second one?"), true);
});
