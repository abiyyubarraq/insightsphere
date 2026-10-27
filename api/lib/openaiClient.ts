import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import OpenAI from "openai";
import { normalizeForEmbedding } from "./chunkText.ts";
import { OpenAIEmptyReplyError, OpenAIRequestError } from "./openaiErrors.ts";

// Logs only status and code. The SDK error itself can print part of the key.
function fail(label: string, action: string, error: unknown): never {
  const failure = new OpenAIRequestError(action, error);
  console.error(label, { status: failure.status, code: failure.code });
  throw failure;
}

export interface EmbeddingRequest {
  text: string;
  model?: string;
}

export interface EmbeddingResponse {
  embedding: number[];
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface ChatCompletionRequest {
  messages: Array<{
    role: "system" | "user" | "assistant";
    content:
      | string
      | Array<{
          type: "text";
          text?: string;
        }>;
  }>;
  model?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  response_format?: { type: "text" | "json_object" };
  /** The SDK otherwise waits 10 minutes and retries twice, which is not a
   * timeout any caller can build a guard on. */
  signal?: AbortSignal;
}

export interface ChatCompletionResponse {
  answer: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  model: string;
}

export class OpenAIClient {
  private client: OpenAI;

  constructor(apiKey?: string) {
    if (!apiKey) {
      apiKey = Deno.env.get("OPENAI_API_KEY");
    }
    if (!apiKey) {
      throw new Error("OpenAI API key is required");
    }

    this.client = new OpenAI({
      apiKey,
    });
  }

  async generateEmbedding(
    request: EmbeddingRequest
  ): Promise<EmbeddingResponse> {
    // Both halves of the search have to be built from the same text. This used
    // to compute input for the empty check and then send a differently
    // normalised string that stripped every non-ASCII character, while the
    // document path used normalizeForEmbedding untouched.
    const input = normalizeForEmbedding(request.text);
    if (!input) {
      throw new Error("Cannot embed empty text");
    }
    try {
      const response = await this.client.embeddings.create({
        model: request.model || "text-embedding-3-small",
        input,
        encoding_format: "float",
      });

      if (!response.data || response.data.length === 0) {
        throw new Error("No embedding data returned from OpenAI");
      }

      return {
        embedding: response.data[0].embedding,
        usage: {
          prompt_tokens: response.usage?.prompt_tokens || 0,
          total_tokens: response.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      fail("OpenAI embedding generation failed:", "Failed to generate embedding", error);
    }
  }

  async generateBatchEmbeddings(
    texts: string[],
    model = "text-embedding-3-small",
    batchSize = 20
  ): Promise<EmbeddingResponse[]> {
    try {
      const allResults: EmbeddingResponse[] = [];
      const totalBatches = Math.ceil(texts.length / batchSize);

      console.log(
        `📦 Processing ${texts.length} texts in ${totalBatches} batches of ${batchSize}...`
      );

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;

        console.log(
          `  🔄 Batch ${batchNumber}/${totalBatches}: ${batch.length} texts...`
        );

        const response = await this.client.embeddings.create({
          model,
          input: batch.map(normalizeForEmbedding),
          encoding_format: "float",
        });

        if (!response.data || response.data.length === 0) {
          throw new Error(
            `No embedding data returned for batch ${batchNumber}`
          );
        }

        const batchResults = response.data.map((item) => ({
          embedding: item.embedding,
          usage: {
            prompt_tokens: response.usage?.prompt_tokens || 0,
            total_tokens: response.usage?.total_tokens || 0,
          },
        }));

        allResults.push(...batchResults);

        // Small delay between batches to allow GC and avoid rate limits
        if (i + batchSize < texts.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      console.log(`✅ Completed all ${totalBatches} batches`);
      return allResults;
    } catch (error) {
      fail(
        "OpenAI batch embedding generation failed:",
        "Failed to generate batch embeddings",
        error,
      );
    }
  }

  async generateChatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> {
    try {
      // Transform messages to OpenAI format
      const transformedMessages = request.messages.map((msg) => ({
        role: msg.role,
        content:
          typeof msg.content === "string"
            ? msg.content
            : msg.content.map((item) => ({
                type: item.type,
                ...(item.text && { text: item.text }),
              })),
      }));

      const response = await this.client.chat.completions.create({
        model: request.model || "gpt-4o-mini",
        messages: transformedMessages as ChatCompletionMessageParam[],
        max_tokens: request.max_tokens ?? 500,
        temperature: request.temperature ?? 0.3,
        top_p: request.top_p ?? 0.9,
        ...(request.presence_penalty !== undefined && {
          presence_penalty: request.presence_penalty,
        }),
        ...(request.frequency_penalty !== undefined && {
          frequency_penalty: request.frequency_penalty,
        }),
        ...(request.response_format && {
          response_format: request.response_format,
        }),
      }, request.signal ? { signal: request.signal } : undefined);

      if (!response.choices || response.choices.length === 0) {
        throw new OpenAIEmptyReplyError();
      }

      const answer = response.choices[0]?.message?.content || "";

      return {
        answer,
        usage: {
          input_tokens: response.usage?.prompt_tokens || 0,
          output_tokens: response.usage?.completion_tokens || 0,
          total_tokens: response.usage?.total_tokens || 0,
        },
        model: request.model || "gpt-4o-mini",
      };
    } catch (error) {
      if (error instanceof OpenAIEmptyReplyError) throw error;
      fail(
        "OpenAI chat completion generation failed:",
        "Failed to generate chat completion",
        error,
      );
    }
  }
}

/** The server's own key. Requests made for a user get theirs from openAIForUser. */
export const openaiClient = new OpenAIClient();
