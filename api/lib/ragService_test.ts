import { assert, assertEquals, assertRejects } from "@std/assert";
import type {
  ChatCompletionRequest,
  EmbeddingRequest,
} from "./openaiClient.ts";
import { OpenAIRequestError } from "./openaiErrors.ts";
import type { SearchResult } from "./qdrantClient.ts";
import { REWRITE_MAX_TOKENS } from "./queryRewrite.ts";
import {
  OFF_TOPIC_ANSWER,
  type ProjectKnowledge,
  type RAGOpenAI,
  RAGService,
} from "./ragService.ts";
import { ROUTER_MAX_TOKENS } from "./questionRouter.ts";
import type { SuggestionDoc } from "./suggestions.ts";
import { answerThenSave } from "./chatExchange.ts";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const usage = { prompt_tokens: 1, total_tokens: 1 };

/** A client that tags everything it returns with its own name. */
function fakeClient(name: string, waitMs: number) {
  const seen: string[] = [];
  const client: RAGOpenAI = {
    generateEmbedding: async (request: EmbeddingRequest) => {
      seen.push(`embed:${request.text}`);
      await delay(waitMs);
      return { embedding: [name.charCodeAt(0)], usage };
    },
    generateChatCompletion: async (request: ChatCompletionRequest) => {
      const isRewrite = request.max_tokens === REWRITE_MAX_TOKENS;
      seen.push(isRewrite ? "rewrite" : "answer");
      await delay(waitMs);
      return {
        answer: isRewrite ? `standalone question ${name}` : `answer from ${name}`,
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        model: "gpt-4o-mini",
      };
    },
  };
  return { client, seen };
}

function failingAnswerClient(status: number): RAGOpenAI {
  return {
    generateEmbedding: () => Promise.resolve({ embedding: [1], usage }),
    generateChatCompletion: () =>
      Promise.reject(
        new OpenAIRequestError(
          "Failed to generate chat completion",
          Object.assign(new Error("Incorrect API key provided: sk-abc***wxyz"), {
            status,
          }),
        ),
      ),
  };
}

/** Returns one chunk named after the vector it was searched with. */
function fakeSearch() {
  const vectors: number[][] = [];
  const search = (vector: number[]): Promise<SearchResult[]> => {
    vectors.push(vector);
    return Promise.resolve([{
      id: `chunk-${vector[0]}`,
      content: `passage for ${String.fromCharCode(vector[0])}`,
      score: 0.8,
      metadata: {
        documentId: "doc-1",
        projectId: "project-1",
        userId: "user-1",
        pageNumber: 1,
        chunkIndex: vector[0],
        fileName: "paper.pdf",
        fileType: "pdf",
        createdAt: "2026-10-01T00:00:00.000Z",
      },
    }]);
  };
  return { search, vectors };
}

const history = [
  { role: "user" as const, content: "What causes hallucination?" },
  { role: "assistant" as const, content: "Three causes are described." },
];

// ragService is one shared object. If the client were kept on it, two requests
// at the same time could swap keys, and user A's key would pay for user B.
Deno.test("two queries at the same time each use only their own client", async () => {
  const a = fakeClient("A", 30);
  const b = fakeClient("B", 5);
  const { search } = fakeSearch();
  const service = new RAGService(search);

  const [fromA, fromB] = await Promise.all([
    service.queryProject("project-1", "user-a", "and the second one?", {
      client: a.client,
      own: true,
    }, { conversation_turns: history }),
    service.queryProject("project-1", "user-b", "and the third one?", {
      client: b.client,
      own: true,
    }, { conversation_turns: history }),
  ]);

  assertEquals(fromA.answer, "answer from A");
  assertEquals(fromB.answer, "answer from B");
  assertEquals(fromA.metadata.search_query, "standalone question A");
  assertEquals(fromB.metadata.search_query, "standalone question B");
  assertEquals(a.seen.sort(), [
    "answer",
    "embed:and the second one?",
    "embed:standalone question A",
    "rewrite",
  ]);
  assertEquals(b.seen.sort(), [
    "answer",
    "embed:and the third one?",
    "embed:standalone question B",
    "rewrite",
  ]);
});

// The answer step turned any LLM error into a 200 apology, so a rejected own
// key looked like a working answer.
Deno.test("a rejected own key at the answer step fails the query", async () => {
  const { search } = fakeSearch();
  const service = new RAGService(search);

  const error = await assertRejects(
    () =>
      service.queryProject("project-1", "user-1", "What is N-BEATS?", {
        client: failingAnswerClient(401),
        own: true,
      }),
    OpenAIRequestError,
  );
  assertEquals(error.status, 401);
});

// The server key keeps the apology: the user cannot fix our key.
Deno.test("a server key failure at the answer step still gives the apology", async () => {
  const { search } = fakeSearch();
  const service = new RAGService(search);

  const result = await service.queryProject("project-1", "user-1", "What is N-BEATS?", {
    client: failingAnswerClient(401),
    own: false,
  });

  assertEquals(result.metadata.llm_model, "fallback-with-context");
  assert(result.answer.includes("technical difficulties"));
});

/** Answers with a fixed text, so a test can control what the model cited. */
function answeringClient(answer: string): RAGOpenAI {
  return {
    generateEmbedding: () => Promise.resolve({ embedding: [65], usage }),
    generateChatCompletion: () =>
      Promise.resolve({
        answer,
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        model: "gpt-4o-mini",
      }),
  };
}

// An answer cited [doc_id: 9] with one source in its context. The chip had
// nothing to open, and the bad number was saved and copied into later answers.
Deno.test("an answer loses citations outside its sources before it is saved", async () => {
  const { search } = fakeSearch();
  const service = new RAGService(search);
  let saved = "";

  const { answer } = await answerThenSave({
    conversationId: "c1",
    answer: () =>
      service.queryProject("project-1", "user-1", "What is N-BEATS?", {
        client: answeringClient("A model [doc_id: 1, 9] for prices [doc_id: 9]."),
        own: false,
      }),
    ensureConversation: () => Promise.resolve("c1"),
    saveUser: () => Promise.resolve({ id: "u1" }),
    // Same as the chat route: the saved text is result.answer.
    saveAssistant: (_id, result) => {
      saved = result.answer;
      return Promise.resolve({ id: "a1" });
    },
    deleteMessage: () => Promise.resolve(),
  });

  assertEquals(answer.citations.length, 1);
  assertEquals(answer.answer, "A model [doc_id: 1] for prices.");
  assertEquals(saved, "A model [doc_id: 1] for prices.");
});

/**
 * Records every call. The router call is told apart by its max_tokens and
 * answers with `route`; every other completion is the answer.
 */
function routedClient(route: string | (() => Promise<string>)) {
  const seen: string[] = [];
  const routerQuestions: string[] = [];
  let answerPrompt = "";
  const client: RAGOpenAI = {
    generateEmbedding: (request: EmbeddingRequest) => {
      seen.push("embed");
      return Promise.resolve({ embedding: [request.text.charCodeAt(0)], usage });
    },
    generateChatCompletion: async (request: ChatCompletionRequest) => {
      const content = String(request.messages.at(-1)?.content ?? "");
      if (request.max_tokens === ROUTER_MAX_TOKENS) {
        seen.push(`router:${request.model}:${request.temperature}`);
        routerQuestions.push(content.split("Question: ").at(-1) ?? "");
        const answer = typeof route === "string" ? route : await route();
        return { answer, usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }, model: "gpt-4o-mini" };
      }
      const isRewrite = request.max_tokens === REWRITE_MAX_TOKENS;
      seen.push(isRewrite ? "rewrite" : "answer");
      if (!isRewrite) answerPrompt = content;
      return {
        answer: isRewrite ? "standalone question" : "Both papers study errors [doc_id: 1, 2, 7].",
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        model: "gpt-4o-mini",
      };
    },
  };
  return { client, seen, routerQuestions, prompt: () => answerPrompt };
}

const readyDoc = (n: number, hasSummary: boolean): SuggestionDoc => ({
  id: `doc-${n}`,
  file_name: `paper-${n}.pdf`,
  is_summary_exist: hasSummary,
  updated_at: "2026-10-01T00:00:00.000Z",
});

function fakeKnowledge(docs: SuggestionDoc[], suggestions = ["Q1?", "Q2?", "Q3?", "Q4?"]) {
  const calls: string[] = [];
  const knowledge: ProjectKnowledge = {
    listDocuments: () => {
      calls.push("list");
      return Promise.resolve(docs);
    },
    loadSummaries: (ids) => {
      calls.push(`summaries:${ids.join(",")}`);
      return Promise.resolve(new Map(ids.map((id) => [id, `Summary of ${id}.`])));
    },
    suggestions: () => {
      calls.push("suggestions");
      return Promise.resolve(suggestions);
    },
  };
  return { knowledge, calls };
}

/** Counts searches, and returns one chunk as fakeSearch does. */
function countingSearch() {
  const { search, vectors } = fakeSearch();
  return { search, count: () => vectors.length };
}

// An off-topic question used to pay for an embedding, a search and an answer
// only to say "not enough information". It now makes none of them.
Deno.test("an off-topic question makes no search and no answering call", async () => {
  const { search, count } = countingSearch();
  const { client, seen } = routedClient("off_topic");
  const { knowledge } = fakeKnowledge([readyDoc(1, true)]);

  const result = await new RAGService(search).queryProject(
    "project-1", "user-1", "what's the weather tomorrow", { client, own: false }, {}, knowledge,
  );

  assertEquals(count(), 0);
  assertEquals(seen, ["router:gpt-4o-mini:0"]);
  assertEquals(result.answer, OFF_TOPIC_ANSWER);
  assertEquals(result.citations, []);
  assertEquals(result.metadata.route, "off_topic");
  assertEquals(result.metadata.llm_model, "none");
  assertEquals(result.metadata.suggestions, ["Q1?", "Q2?", "Q3?"]);
});

Deno.test("an off-topic reply with no suggestions offers the fixed questions", async () => {
  const { search } = countingSearch();
  const { client } = routedClient("off_topic");
  const { knowledge } = fakeKnowledge([readyDoc(1, true)], []);

  const result = await new RAGService(search).queryProject(
    "project-1", "user-1", "hello there", { client, own: false }, {}, knowledge,
  );

  assertEquals(result.metadata.suggestions?.length, 3);
});

// "what is the point of all of this paper" scored 0.16-0.22 against every chunk
// and was answered "not enough information". It is answered from the summaries.
Deno.test("an overview question is answered from the summaries, one source per document", async () => {
  const { search, count } = countingSearch();
  const { client, seen, prompt } = routedClient("overview");
  const { knowledge, calls } = fakeKnowledge([readyDoc(1, true), readyDoc(2, false), readyDoc(3, true)]);

  const result = await new RAGService(search).queryProject(
    "project-1", "user-1", "what the point of all of this paper", { client, own: false }, {}, knowledge,
  );

  assertEquals(count(), 0);
  assertEquals(seen, ["router:gpt-4o-mini:0", "answer"]);
  assertEquals(calls, ["list", "summaries:doc-1,doc-3"]);
  assertEquals(result.metadata.route, "overview");
  assertEquals(result.citations.map((c) => [c.document_id, c.chunk_index, c.similarity_score]), [
    ["doc-1", 0, 0],
    ["doc-3", 1, 0],
  ]);
  assert(prompt().includes("[doc_id: 2] Source: paper-3.pdf\nSummary of doc-3."));
  assert(prompt().includes("no summary yet: paper-2.pdf"));
  assert(prompt().includes("one summary per document"));
  // Two sources: the model's [doc_id: 7] has nothing to open.
  assertEquals(result.answer, "Both papers study errors [doc_id: 1, 2].");
});

Deno.test("an overview with no summary at all is answered by search instead", async () => {
  const { search, count } = countingSearch();
  const { client, seen } = routedClient("overview");
  const { knowledge } = fakeKnowledge([readyDoc(1, false)]);

  const result = await new RAGService(search).queryProject(
    "project-1", "user-1", "summarize these documents", { client, own: false }, {}, knowledge,
  );

  assertEquals(count(), 1);
  assertEquals(seen, ["router:gpt-4o-mini:0", "embed", "answer"]);
  assertEquals(result.metadata.route, "fallback");
});

// A router that fails must leave the answer exactly as it was without one.
Deno.test("a router error or bad label falls back to search and answer", async () => {
  for (const route of ["overview please", () => Promise.reject(new Error("502"))]) {
    const { search, count } = countingSearch();
    const { client, seen } = routedClient(route);
    const { knowledge } = fakeKnowledge([readyDoc(1, true)]);

    const result = await new RAGService(search).queryProject(
      "project-1", "user-1", "What is N-BEATS?", { client, own: false }, {}, knowledge,
    );

    assertEquals(count(), 1);
    assertEquals(seen.slice(1), ["embed", "answer"]);
    assertEquals(result.metadata.route, "fallback");
    assertEquals(result.citations.length, 1);
  }
});

Deno.test("a specific question takes the search path unchanged", async () => {
  const { search, count } = countingSearch();
  const { client, seen } = routedClient("specific");
  const { knowledge } = fakeKnowledge([readyDoc(1, true)]);

  const result = await new RAGService(search).queryProject(
    "project-1", "user-1", "What is psychological inoculation?", { client, own: false }, {}, knowledge,
  );

  assertEquals(count(), 1);
  assertEquals(seen, ["router:gpt-4o-mini:0", "embed", "answer"]);
  assertEquals(result.metadata.route, "specific");
});

// With nothing ready there is no topic to judge against. Search gives the
// usual "not enough information" and the router costs nothing.
Deno.test("with no ready documents the router does not run", async () => {
  const { search } = countingSearch();
  const { client, seen } = routedClient("off_topic");
  const { knowledge } = fakeKnowledge([]);

  const result = await new RAGService(search).queryProject(
    "project-1", "user-1", "hello", { client, own: false }, {}, knowledge,
  );

  assertEquals(seen, ["embed", "answer"]);
  assertEquals(result.metadata.route, "specific");
});

// "and the second one?" means nothing alone. The router must judge what the
// follow-up means, which is the rewrite.
Deno.test("the router sees the original on a first turn and the rewrite on a follow-up", async () => {
  const { search } = countingSearch();
  const service = new RAGService(search);

  const first = routedClient("specific");
  await service.queryProject("project-1", "user-1", "What causes hallucination?", {
    client: first.client,
    own: false,
  }, {}, fakeKnowledge([readyDoc(1, true)]).knowledge);
  assertEquals(first.routerQuestions, ["What causes hallucination?"]);

  const followUp = routedClient("specific");
  await service.queryProject("project-1", "user-1", "and the second one?", {
    client: followUp.client,
    own: false,
  }, { conversation_turns: history }, fakeKnowledge([readyDoc(1, true)]).knowledge);
  assertEquals(followUp.routerQuestions, ["standalone question"]);
  assertEquals(followUp.seen[0], "rewrite");
});
