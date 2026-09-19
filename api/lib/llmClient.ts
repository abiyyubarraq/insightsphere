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

export interface AnswerOptions {
  conversationHistory?: string;
  /** The best chunk scored below the sufficiency floor. The answer is still
   * produced, but the model is told not to stretch the context to cover the
   * question. */
  lowConfidence?: boolean;
}

export interface LLMClient {
  generateAnswer(
    context: string,
    query: string,
    options?: AnswerOptions,
  ): Promise<LLMResponse>;
}

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
    options: AnswerOptions = {},
  ): Promise<LLMResponse> {
    const { conversationHistory, lowConfidence = false } = options;

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
        lowConfidence
          ? "The retrieved context is only a weak match for this question and may not cover it. If it does not answer the question, say so plainly rather than stretching what is there."
          : "",
        "If information is missing or unclear, acknowledge this explicitly.",
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
              "5. **No Arithmetic**: Every number in your answer must appear literally in the context. Do not add, subtract, total, average, convert units or percentages, or otherwise compute a figure that is not written there. If a number is not in the context, say it is not stated.",
              "6. **Structured Clarity**: Use clear paragraphs, bullet points when appropriate, and logical flow.",
              "7. **Conversational Awareness**: If previous conversation is provided, maintain context continuity while staying grounded in documents.",
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
        max_tokens: 2000,
        temperature: 0.1,
        top_p: 0.95,
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
        }`,
      );
    }
  }
}

export class LLMClientFactory {
  static create(): LLMClient {
    if (!Deno.env.get("OPENAI_API_KEY")) {
      throw new Error("No LLM API key found. Set OPENAI_API_KEY");
    }
    console.log("🤖 Using OpenAI LLM client");
    return new OpenAILLMClient();
  }

  static createOpenAI(model?: string): LLMClient {
    return new OpenAILLMClient(model);
  }
}

// Export singleton instance
export const llmClient = LLMClientFactory.create();
