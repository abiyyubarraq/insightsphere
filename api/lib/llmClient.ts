/**
 * LLM Client for RAG Query Processing
 */

import { type ChatCompletionRequest, openaiClient } from "./openaiClient.ts";

export interface LLMResponse {
  answer: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  model: string;
}

export interface LLMClient {
  generateAnswer(
    context: string,
    query: string,
    conversationHistory?: string
  ): Promise<LLMResponse>;
}

/**
 * Hugging Face LLM Client using official Inference API package (fallback/alternative)
 */
// export class HuggingFaceLLMClient implements LLMClient {
//   private readonly hf: InferenceClient;
//   private readonly model: string;

//   // Fallback models to try if primary fails (using public models only)
//   private readonly fallbackModels = AI_MODELS;

//   constructor(model = AI_MODELS[0]) {
//     const apiKey = Deno.env.get("HUGGINGFACE_API_KEY") || "";
//     if (!apiKey) {
//       throw new Error("HUGGINGFACE_API_KEY environment variable is required");
//     }
//     this.hf = new InferenceClient(apiKey);
//     this.model = model;
//   }

//   async generateAnswer(context: string, query: string): Promise<LLMResponse> {
//     const prompt = this.buildPrompt(context, query);
//     console.log(`📝 Prompt length: ${prompt.length} characters`);

//     // Try primary model first, then fallbacks
//     const modelsToTry = [
//       this.model,
//       ...this.fallbackModels.filter((m) => m !== this.model),
//     ];

//     for (let i = 0; i < modelsToTry.length; i++) {
//       const currentModel = modelsToTry[i];
//       try {
//         console.log(
//           `🤖 Trying Hugging Face LLM: ${currentModel} (attempt ${
//             i + 1
//           }/${modelsToTry.length})`,
//         );

//         const response = await this.callHuggingFaceModel(currentModel, prompt);

//         if (response) {
//           console.log(
//             `✅ Successfully generated response with ${currentModel}`,
//           );
//           return {
//             ...response,
//             model: currentModel,
//           };
//         }
//       } catch (error) {
//         console.warn(
//           `⚠️ Model ${currentModel} failed:`,
//           error instanceof Error ? error.message : "Unknown error",
//         );

//         // If this is the last model, throw the error
//         if (i === modelsToTry.length - 1) {
//           throw error;
//         }
//         // Otherwise, continue to next model
//         continue;
//       }
//     }

//     // Final fallback: return a basic response
//     console.warn(
//       "🚨 All Hugging Face models failed, using intelligent fallback response",
//     );
//     return {
//       answer: this.generateIntelligentFallback(context, query),
//       model: "intelligent-fallback",
//       usage: {
//         input_tokens: Math.ceil(prompt.length / 4),
//         output_tokens: 100,
//         total_tokens: Math.ceil(prompt.length / 4) + 100,
//       },
//     };
//   }

//   private async callHuggingFaceModel(
//     model: string,
//     prompt: string,
//   ): Promise<Omit<LLMResponse, "model"> | null> {
//     try {
//       console.log(`🔗 Calling model: ${model}`);

//       // Check if this is a conversational/chat model
//       const isConversationalModel = this.isConversationalModel(model);

//       if (isConversationalModel) {
//         return await this.callConversationalModel(model, prompt);
//       } else {
//         return await this.callTextGenerationModel(model, prompt);
//       }
//     } catch (error) {
//       console.error(`🚫 Model ${model} failed:`, error);

//       // Enhanced error logging for debugging
//       if (error instanceof Error) {
//         console.error(`Error details:`, {
//           message: error.message,
//           name: error.name,
//           stack: error.stack?.split("\n").slice(0, 3).join("\n"),
//         });
//       }

//       throw error;
//     }
//   }

//   private isConversationalModel(model: string): boolean {
//     return CONVERSATIONAL_MODELS.some((modelName) => model.includes(modelName));
//   }

//   private async callConversationalModel(
//     model: string,
//     prompt: string,
//   ): Promise<Omit<LLMResponse, "model"> | null> {
//     console.log(`💬 Using conversational API for model: ${model}`);

//     const { context, query } = this.extractContextAndQuery(prompt);

//     const messages = [
//       {
//         role: "system" as const,
//         content:
//           "You are InsightSphere, an intelligent assistant that answers questions based only on the provided context. If the context doesn't contain relevant information, say so clearly.",
//       },
//       {
//         role: "user" as const,
//         content: `Context:\n${context}\n\nQuestion: ${query}`,
//       },
//     ];

//     const parameters = {
//       max_new_tokens: model.includes("SmolLM3") ? 1500 : 1000,
//       temperature: 0.3,
//       do_sample: true,
//       top_p: 0.9,
//       repetition_penalty: 1.1,
//     };

//     const result = await this.hf.chatCompletion({
//       model: model,
//       messages: messages,
//       max_tokens: parameters.max_new_tokens,
//       temperature: parameters.temperature,
//     });
//     console.log("Result:", result);
//     const answer = this.cleanResponse(
//       result.choices?.[0]?.message?.content || "",
//     );
//     console.log("Answer:", answer);
//     if (!answer || answer.trim().length === 0) {
//       console.warn(`Empty response from conversational model ${model}`);
//       return null;
//     }

//     return {
//       answer,
//       usage: {
//         input_tokens: result.usage?.prompt_tokens ||
//           Math.ceil(prompt.length / 4),
//         output_tokens: result.usage?.completion_tokens ||
//           Math.ceil(answer.length / 4),
//         total_tokens: result.usage?.total_tokens ||
//           Math.ceil((prompt.length + answer.length) / 4),
//       },
//     };
//   }

//   private async callTextGenerationModel(
//     model: string,
//     prompt: string,
//   ): Promise<Omit<LLMResponse, "model"> | null> {
//     console.log(`📝 Using text generation API for model: ${model}`);

//     // const parameters = {
//     //   max_new_tokens: 100,
//     //   temperature: 0.7,
//     //   do_sample: true,
//     // };

//     // Use the official Hugging Face inference package
//     const requestOptions: BaseArgs & TextGenerationInput = {
//       model: model,
//       inputs: prompt,
//       // parameters: parameters,
//     };

//     const result = await this.hf.textGeneration(requestOptions);

//     // Extract the generated text
//     const answer = this.cleanResponse(result.generated_text || "");

//     if (!answer || answer.trim().length === 0) {
//       console.warn(`Empty response from text generation model ${model}`);
//       return null;
//     }

//     return {
//       answer,
//       usage: {
//         input_tokens: Math.ceil(prompt.length / 4), // Rough estimation
//         output_tokens: Math.ceil(answer.length / 4),
//         total_tokens: Math.ceil((prompt.length + answer.length) / 4),
//       },
//     };
//   }

//   private extractContextAndQuery(
//     prompt: string,
//   ): { context: string; query: string } {
//     // Parse the prompt to extract context and query
//     const contextMatch = prompt.match(/Context:\s*(.*?)\n\nQuestion:/s);
//     const queryMatch = prompt.match(/Question:\s*(.*?)\n\nAnswer:/s);

//     const context = contextMatch?.[1]?.trim() || "";
//     const query = queryMatch?.[1]?.trim() || prompt;

//     return { context, query };
//   }

//   private buildPrompt(context: string, query: string): string {
//     // Enhanced prompt for gpt-oss models
//     if (this.model.includes("gpt-oss")) {
//       return `You are InsightSphere, an intelligent assistant that answers questions based only on the provided context. If the context doesn't contain relevant information, say so clearly.

// Context:
// ${context}

// Question: ${query}

// Answer:`;
//     }

//     // Simplified prompt for basic models
//     return `Context: ${context}

// Question: ${query}

// Answer: Based on the context,`;
//   }

//   private cleanResponse(answer: string): string {
//     // Remove common artifacts from LLM responses
//     answer = answer.trim();

//     // Remove SmolLM3 thinking tags and content (keep everything after </think>)
//     answer = answer.replace(/<think>.*?<\/think>\s*/gs, "").trim();

//     // Remove any repeated prompt parts
//     answer = answer.replace(/^Context:.*?Answer:\s*/s, "");
//     answer = answer.replace(/^Question:.*?Answer:\s*/s, "");
//     answer = answer.replace(/^Based on the context,\s*/i, "");

//     // Remove any remaining XML-like tags
//     answer = answer.replace(/<[^>]*>/g, "").trim();

//     // Don't remove content after double newlines - that's legitimate content!
//     // Only remove trailing brackets if they look like artifacts
//     answer = answer.replace(/\[.*?\]$/g, ""); // Remove trailing brackets

//     return answer.trim();
//   }

//   private generateIntelligentFallback(context: string, query: string): string {
//     // Extract key information from context
//     const sentences = context.split(/[.!?]+/).filter((s) =>
//       s.trim().length > 10
//     );
//     const relevantSentences = sentences.slice(0, 3); // Take first 3 sentences

//     // Create a structured response based on the query type
//     const queryLower = query.toLowerCase();

//     if (
//       queryLower.includes("what") || queryLower.includes("how") ||
//       queryLower.includes("explain")
//     ) {
//       return `Based on the provided documents, here's what I found regarding "${query}": ${
//         relevantSentences.join(" ")
//       }. The documents contain detailed information about this topic, and I've highlighted the most relevant sections above.`;
//     } else if (
//       queryLower.includes("summarize") || queryLower.includes("summary")
//     ) {
//       return `Here's a summary of the key points from your documents: ${
//         relevantSentences.join(" ")
//       }. These appear to be the most important findings and conclusions from the material.`;
//     } else if (queryLower.includes("find") || queryLower.includes("search")) {
//       return `I found the following relevant information in your documents: ${
//         relevantSentences.join(" ")
//       }. This content appears to be directly related to your query.`;
//     } else {
//       return `Based on your question "${query}", here's the relevant information from your documents: ${
//         relevantSentences.join(" ")
//       }. This represents the most pertinent content I could identify.`;
//     }
//   }
// }

/**
 * OpenAI LLM Client
 */
export class OpenAILLMClient implements LLMClient {
  private readonly model: string;

  constructor(model = "gpt-4o-mini") {
    this.model = model;
  }

  async generateAnswer(
    context: string,
    query: string,
    conversationHistory?: string
  ): Promise<LLMResponse> {
    try {
      console.log(`🤖 Calling OpenAI LLM: ${this.model}`);

      // Build user message with optional conversation history
      const userMessageParts: string[] = [];

      // Add conversation history if provided
      if (conversationHistory?.trim()) {
        userMessageParts.push(conversationHistory);
      }

      // Add current context and question
      userMessageParts.push(
        "### Context from Documents",
        context,
        "",
        "### Current Question",
        query,
        "",
        "### Response Requirements",
        "Provide a clear, factual answer based on the context above.",
        "Include citations using [doc_id: N] format (numeric only, e.g., [doc_id: 1] or [doc_id: 1, 2]).",
        conversationHistory
          ? "Consider the previous conversation when answering, but base your response on the provided document context."
          : "",
        "If information is missing or unclear, acknowledge this explicitly."
      );

      const request: ChatCompletionRequest = {
        model: this.model,
        messages: [
          {
            role: "system",
            content: [
              "You are InsightSphere, an intelligent document analysis assistant.",
              "",
              "## Core Principles:",
              "1. **Context Fidelity**: Answer ONLY using the provided context. Never add external knowledge.",
              "2. **Citation Discipline**: Each document in the context is labeled with [doc_id: N]. When citing, use ONLY the numeric ID in format [doc_id: N] or [doc_id: N, M] for multiple sources. Example: 'The findings show improvement [doc_id: 1, 3].'",
              "3. **Transparency**: If context is insufficient, clearly state: 'The provided context does not contain enough information to answer this question.'",
              "4. **Accuracy First**: Preserve technical terms, numbers, and domain-specific language exactly as in the source.",
              "5. **Structured Clarity**: Use clear paragraphs, bullet points when appropriate, and logical flow.",
              "6. **Conversational Awareness**: If previous conversation is provided, maintain context continuity while staying grounded in documents.",
              "",
              "## Citation Format (CRITICAL):",
              "- Documents are labeled as [doc_id: 1], [doc_id: 2], etc.",
              "- ALWAYS cite using ONLY the numeric ID: [doc_id: 1] or [doc_id: 1, 2]",
              "- NEVER include filenames or page numbers in citations",
              "- WRONG: [doc_id: report.pdf, Page 4]",
              "- CORRECT: [doc_id: 1]",
              "",
              "## Output Format:",
              "- Start with a direct answer to the question",
              "- Support with specific evidence from context",
              "- Include document citations inline using [doc_id: N] format",
              "- Reference previous conversation naturally when relevant",
              "- End with a brief summary if the answer is long",
              "- Use **Markdown formatting** for better readability:",
              "  - Use **bold** for emphasis",
              "  - Use *italics* for subtle emphasis",
              "  - Use `code` for technical terms or code snippets",
              "  - Use ```code blocks``` for multi-line code",
              "  - Use bullet points (-) or numbered lists (1.) for lists",
              "  - Use > blockquotes for important notes",
              "",
              "## Quality Standards:",
              "- Be concise but complete",
              "- Avoid speculation, assumptions, or hedging language",
              "- Use active voice and clear language",
              "- Maintain professional, neutral tone",
              "- Handle follow-up questions by connecting to previous context",
            ].join("\n"),
          },
          {
            role: "user",
            content: userMessageParts.filter((part) => part.trim()).join("\n"),
          },
        ],
        max_tokens: 2000, // More reasonable default - adjust based on use case
        temperature: 0.1, // Even lower for maximum consistency
        top_p: 0.95, // Slightly higher for better quality
        // presence_penalty: 0.0, // Optional: prevents repetition
        // frequency_penalty: 0.0, // Optional: prevents repetition
      };
      const result = await openaiClient.generateChatCompletion(request);
      console.log(`✅ LLM Response received from ${this.model}`);

      return {
        answer: result.answer,
        usage: result.usage,
        model: result.model,
      };
    } catch (error) {
      console.error("OpenAI LLM generation failed:", error);
      throw new Error(
        `Failed to generate OpenAI response: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}

/**
 * LLM Client Factory with fallback support
 */
export class LLMClientFactory {
  static create(): LLMClient {
    // Try Hugging Face first, fallback to OpenAI
    // const hfApiKey = Deno.env.get("HUGGINGFACE_API_KEY");
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (openaiApiKey) {
      console.log("🤖 Using OpenAI LLM client");
      return new OpenAILLMClient();
    } // else if (hfApiKey) {
    //   console.log("🤗 Using Hugging Face LLM client");
    //   return new HuggingFaceLLMClient();
    // }
    else {
      throw new Error(
        "No LLM API key found. Set HUGGINGFACE_API_KEY or OPENAI_API_KEY"
      );
    }
  }

  // static createHuggingFace(model?: string): LLMClient {
  //   return new HuggingFaceLLMClient(model);
  // }

  static createOpenAI(model?: string): LLMClient {
    return new OpenAILLMClient(model);
  }
}

// Export singleton instance
export const llmClient = LLMClientFactory.create();
