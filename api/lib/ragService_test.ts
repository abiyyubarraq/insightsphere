import { assert, assertEquals, assertRejects } from "@std/assert";
import type {
  ChatCompletionRequest,
  EmbeddingRequest,
} from "./openaiClient.ts";
import { OpenAIRequestError } from "./openaiErrors.ts";
import type { SearchResult } from "./qdrantClient.ts";
import { REWRITE_MAX_TOKENS } from "./queryRewrite.ts";
import { type RAGOpenAI, RAGService } from "./ragService.ts";
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
