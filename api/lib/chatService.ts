/**
 * Chat Service for Conversational RAG
 *
 * Handles:
 * 1. Chat history storage (user messages + AI responses + citations)
 * 2. Context-aware conversations (includes previous messages in context)
 * 3. Citation tracking for each AI response
 */

import { type SupabaseClient } from "@supabase/supabase-js";
import type { ChatConversation, ChatMessage } from "../../shared/types/chat.ts";
import type { RAGQueryResult } from "./ragService.ts";

export class ChatService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get or create conversation for a project
   */
  async getOrCreateConversation(
    projectId: string,
    userId: string,
  ): Promise<ChatConversation> {
    try {
      // Try to get existing conversation
      const { data: existing, error: fetchError } = await this.supabase
        .from("chat_conversations")
        .select("*")
        .eq("project_id", projectId)
        .eq("user_id", userId)
        .single();

      if (existing && !fetchError) {
        return existing as ChatConversation;
      }

      // Create new conversation
      const { data: newConv, error: createError } = await this.supabase
        .from("chat_conversations")
        .insert({
          project_id: projectId,
          user_id: userId,
          title: "New Conversation",
        })
        .select()
        .single();

      if (createError) throw new Error(createError.message);
      return newConv as ChatConversation;
    } catch (error) {
      console.error("Failed to get/create conversation:", error);
      throw new Error(
        `Failed to initialize conversation: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  /**
   * Save user message to conversation
   */
  async saveUserMessage(
    conversationId: string,
    content: string,
    queryEmbedding?: number[],
  ): Promise<ChatMessage> {
    try {
      const { data, error } = await this.supabase
        .from("chat_messages")
        .insert({
          conversation_id: conversationId,
          role: "user",
          content,
          query_embedding: queryEmbedding || null,
          metadata: {
            query_length: content.length,
          },
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data as ChatMessage;
    } catch (error) {
      console.error("Failed to save user message:", error);
      throw new Error(
        `Failed to save message: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  /**
   * Save assistant message with citations
   */
  async saveAssistantMessage(
    conversationId: string,
    content: string,
    ragResult: RAGQueryResult,
  ): Promise<ChatMessage> {
    try {
      // Save assistant message
      const { data: message, error: messageError } = await this.supabase
        .from("chat_messages")
        .insert({
          conversation_id: conversationId,
          role: "assistant",
          content,
          metadata: {
            chunks_retrieved: ragResult.metadata.chunks_retrieved,
            chunks_used: ragResult.metadata.chunks_used,
            avg_similarity: ragResult.metadata.avg_similarity,
            processing_time_ms: ragResult.metadata.processing_time_ms,
            llm_model: ragResult.metadata.llm_model,
            embedding_model: ragResult.metadata.embedding_model,
            context_length: ragResult.metadata.context_length,
          },
        })
        .select()
        .single();

      if (messageError) throw new Error(messageError.message);

      const assistantMessage = message as ChatMessage;

      // Save citations
      if (ragResult.citations && ragResult.citations.length > 0) {
        const citationsToInsert = ragResult.citations.map((citation) => ({
          message_id: assistantMessage.id,
          document_id: citation.document_id,
          file_name: citation.file_name,
          page_number: citation.page_number,
          chunk_index: citation.chunk_index,
          similarity_score: citation.similarity_score,
          text_snippet: citation.text_snippet,
        }));

        const { error: citationsError } = await this.supabase
          .from("chat_citations")
          .insert(citationsToInsert);

        if (citationsError) {
          console.warn("Failed to save citations:", citationsError);
          // Don't fail the whole operation if citations fail
        }
      }

      return assistantMessage;
    } catch (error) {
      console.error("Failed to save assistant message:", error);
      throw new Error(
        `Failed to save response: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  /**
   * Build context window from conversation history
   * This creates a conversational context for the LLM
   *
   * Format:
   * Previous conversation:
   * User: [question 1]
   * Assistant: [answer 1]
   * User: [question 2]
   * Assistant: [answer 2]
   *
   * Current question: [new question]
   */
  buildConversationalContext(
    messages: ChatMessage[],
    maxMessages = 6, // Last 3 pairs of user-assistant messages
  ): string {
    if (messages.length === 0) return "";

    // Take the last N messages
    const recentMessages = messages.slice(-maxMessages);

    // Build conversation context
    const conversationContext = recentMessages
      .map((msg) => {
        const role = msg.role === "user" ? "User" : "Assistant";
        return `${role}: ${msg.content}`;
      })
      .join("\n\n");

    return conversationContext
      ? `## Previous Conversation:\n${conversationContext}\n\n`
      : "";
  }

  /**
   * Get the latest messages for context (without full history fetch)
   * More efficient for just building context
   */
  async getRecentMessagesForContext(
    conversationId: string,
    maxMessages = 6,
  ): Promise<ChatMessage[]> {
    try {
      const { data, error } = await this.supabase
        .from("chat_messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(maxMessages);

      if (error) throw new Error(error.message);

      // Reverse to get chronological order
      return ((data || []) as ChatMessage[]).reverse();
    } catch (error) {
      console.error("Failed to get recent messages:", error);
      // Don't fail the whole operation if context fetch fails
      return [];
    }
  }

  /**
   * Update conversation title
   */
  async updateConversationTitle(
    conversationId: string,
    userId: string,
    title: string,
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("chat_conversations")
        .update({ title })
        .eq("id", conversationId)
        .eq("user_id", userId);

      if (error) throw new Error(error.message);
    } catch (error) {
      console.error("Failed to update conversation title:", error);
      throw new Error(
        `Failed to update title: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }
}
