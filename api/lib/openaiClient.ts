import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import OpenAI from "openai";

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
          type: "text" | "file";
          text?: string;
          file?: { file_id: string };
        }>;
  }>;
  model?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  response_format?: { type: "text" | "json_object" };
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
    try {
      const response = await this.client.embeddings.create({
        model: request.model || "text-embedding-3-small",
        input: request.text
          .replace(/\s+/g, " ") // collapse whitespace
          .replace(/[^\x20-\x7E]/g, "") // remove non-ASCII if docs mixed
          .trim(),
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
      console.error("OpenAI embedding generation failed:", error);
      throw new Error(
        `Failed to generate embedding: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async generateBatchEmbeddings(
    texts: string[],
    model = "text-embedding-3-small"
  ): Promise<EmbeddingResponse[]> {
    try {
      const response = await this.client.embeddings.create({
        model,
        input: texts,
        encoding_format: "float",
      });

      if (!response.data || response.data.length === 0) {
        throw new Error("No embedding data returned from OpenAI");
      }

      return response.data.map((item) => ({
        embedding: item.embedding,
        usage: {
          prompt_tokens: response.usage?.prompt_tokens || 0,
          total_tokens: response.usage?.total_tokens || 0,
        },
      }));
    } catch (error) {
      console.error("OpenAI batch embedding generation failed:", error);
      throw new Error(
        `Failed to generate batch embeddings: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
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
                ...(item.file && { file: item.file }),
              })),
      }));

      const response = await this.client.chat.completions.create({
        model: request.model || "gpt-4o-mini",
        messages: transformedMessages as ChatCompletionMessageParam[],
        max_tokens: request.max_tokens || 500,
        temperature: request.temperature || 0.3,
        top_p: request.top_p || 0.9,
        ...(request.presence_penalty !== undefined && {
          presence_penalty: request.presence_penalty,
        }),
        ...(request.frequency_penalty !== undefined && {
          frequency_penalty: request.frequency_penalty,
        }),
        ...(request.response_format && {
          response_format: request.response_format,
        }),
      });

      if (!response.choices || response.choices.length === 0) {
        throw new Error("No completion choices returned from OpenAI");
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
      console.error("OpenAI chat completion generation failed:", error);
      throw new Error(
        `Failed to generate chat completion: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    try {
      await this.client.files.del(fileId);
    } catch (error) {
      console.error("File deletion failed:", error);
      throw new Error(
        `Failed to delete file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async uploadFile(filePath: string): Promise<string> {
    try {
      // Read the file using Deno's file API
      const fileData = await Deno.readFile(filePath);
      const fileName = filePath.split("/").pop() || "document";

      // Create a File object from the data
      const file = new File([fileData], fileName, {
        type: this.getFileType(fileName),
      });

      const response = await this.client.files.create({
        file: file,
        purpose: "assistants",
      });
      return response.id;
    } catch (error) {
      console.error("File upload failed:", error);
      throw new Error(
        `Failed to upload file to OpenAI: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private getFileType(fileName: string): string {
    const extension = fileName.split(".").pop()?.toLowerCase();
    switch (extension) {
      case "pdf":
        return "application/pdf";
      case "docx":
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      case "doc":
        return "application/msword";
      case "txt":
        return "text/plain";
      default:
        return "application/octet-stream";
    }
  }
}

// Export singleton instance
export const openaiClient = new OpenAIClient();
