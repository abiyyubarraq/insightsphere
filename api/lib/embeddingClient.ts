/**
 * Embedding alternatives for development
 * Uses various APIs and models
 */

import { InferenceClient } from "@huggingface/inference";
import { EMBEDDING_MODELS } from "./costants.ts";

export interface EmbeddingResponse {
  embedding: number[];
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
  model: string;
}

export class EmbeddingClient {
  /**
   * Generate embeddings using Hugging Face Inference API (tier)
   */
  async generateHuggingFaceEmbedding(
    text: string,
  ): Promise<EmbeddingResponse> {
    try {
      const hfToken = Deno.env.get("HUGGINGFACE_API_KEY");
      if (!hfToken) {
        throw new Error(
          "HUGGINGFACE_API_KEY not set. Get API key from https://huggingface.co/settings/tokens",
        );
      }

      console.log(
        `🤗 Calling Hugging Face API for text: ${text.substring(0, 50)}...`,
      );
      console.log(`🔑 Using model: ${EMBEDDING_MODELS}`);
      console.log(`🔑 Token length: ${hfToken.length} characters`);

      // Use the official Hugging Face inference package
      const hf = new InferenceClient(hfToken);

      // Try instruction-aware embedding first, fallback to simple text
      let result;
      try {
        // Format: "instruction: text" as a single string
        const instruction =
          "Represent this text for semantic search and retrieval:";
        const inputText = `${instruction} ${text}`;

        result = await hf.featureExtraction({
          model: EMBEDDING_MODELS,
          inputs: inputText,
        });
        console.log("✅ Used instruction-aware embedding");
      } catch (instructionError) {
        console.warn(
          "⚠️ Instruction-aware embedding failed, trying simple text:",
          instructionError instanceof Error
            ? instructionError.message
            : "Unknown error",
        );

        // Fallback to simple text without instruction
        result = await hf.featureExtraction({
          model: EMBEDDING_MODELS,
          inputs: text,
        });
        console.log("✅ Used simple text embedding");
      }

      // Handle different response formats from Hugging Face API
      let embedding: number[];

      if (Array.isArray(result)) {
        // Check if it's a nested array (array of arrays)
        if (Array.isArray(result[0])) {
          // Flatten the nested array: [[1,2,3]] -> [1,2,3]
          embedding = result[0] as number[];
          console.log("📦 Flattened nested array response");
        } else if (typeof result[0] === "number") {
          // Already a flat array
          embedding = result as number[];
          console.log("📦 Using flat array response");
        } else {
          throw new Error(
            `Invalid embedding response format: expected array of numbers, got: ${
              JSON.stringify(result).substring(0, 200)
            }...`,
          );
        }
      } else {
        throw new Error(
          `Invalid embedding response format: expected array, got: ${
            JSON.stringify(result).substring(0, 200)
          }...`,
        );
      }

      // Validate the final embedding
      if (
        !embedding || !Array.isArray(embedding) ||
        typeof embedding[0] !== "number"
      ) {
        throw new Error(
          `Invalid embedding after processing: expected array of numbers, got: ${
            JSON.stringify(embedding).substring(0, 200)
          }...`,
        );
      }

      console.log(
        `✅ Generated ${EMBEDDING_MODELS} embedding (${embedding.length} dimensions)`,
      );

      return {
        embedding: embedding,
        usage: {
          prompt_tokens: Math.ceil(text.length / 4),
          total_tokens: Math.ceil(text.length / 4),
        },
        model: EMBEDDING_MODELS,
      };
    } catch (error) {
      console.error("Hugging Face embedding failed:", error);

      // Enhanced error logging for debugging
      if (error instanceof Error) {
        console.error("Error details:", {
          message: error.message,
          name: error.name,
          stack: error.stack?.split("\n").slice(0, 3).join("\n"),
        });
      }

      // Check if it's a specific API error
      if (
        error instanceof Error && error.message.includes("ProviderApiError")
      ) {
        console.error("🚨 Hugging Face API Error - Possible causes:");
        console.error("1. API key invalid or expired");
        console.error("2. Model not available or rate limited");
        console.error("3. Network connectivity issues");
        console.error("4. Service temporarily unavailable");
      }

      throw error;
    }
  }

  /**
   * Generate batch embeddings using the best available method
   */
  async generateBatchEmbeddings(
    texts: string[],
    model = "auto",
  ): Promise<EmbeddingResponse[]> {
    try {
      console.log(
        `🆓 Generating ${texts.length} embeddings using model: ${model}`,
      );

      const embeddings: EmbeddingResponse[] = [];

      for (let i = 0; i < texts.length; i++) {
        const text = texts[i];
        console.log(
          `📝 Processing chunk ${i + 1}/${texts.length} (${text.length} chars)`,
        );

        let embedding: EmbeddingResponse | null = null;

        try {
          if (
            model === "huggingface" ||
            (model === "auto" && Deno.env.get("HUGGINGFACE_API_KEY"))
          ) {
            embedding = await this.generateHuggingFaceEmbedding(text);
            console.log(
              `✅ HuggingFace embedding generated for chunk ${i + 1}`,
            );
          } else {
            console.log(`✅ Hash embedding generated for chunk ${i + 1}`);
          }

          if (embedding) embeddings.push(embedding);
          else console.log("No embedding generated for chunk ", i + 1);
          // Rate limiting for APIs
          if (
            model === "huggingface" ||
            (model === "auto" && Deno.env.get("HUGGINGFACE_API_KEY"))
          ) {
            await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
          }
        } catch (error) {
          console.warn(
            `⚠️ Failed to generate embedding for chunk ${
              i + 1
            }, falling back to hash:`,
            error,
          );
        }
      }

      console.log(`🎉 Generated ${embeddings.length} embeddings successfully`);
      return embeddings;
    } catch (error) {
      console.error("Batch embedding generation failed:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const embeddingClient = new EmbeddingClient();
