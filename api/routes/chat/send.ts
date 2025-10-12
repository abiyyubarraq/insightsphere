/**
 * Chat message send endpoint - Conversational RAG
 *
 * POST /v1/projects/:projectId/chat
 *
 * Handles:
 * 1. Creating/retrieving conversation
 * 2. Saving user message
 * 3. Retrieving relevant document chunks with RAG
 * 4. Including conversation history for context-aware responses
 * 5. Generating AI response with citations
 * 6. Saving assistant message and citations
 */

import { type Context } from "hono";
import { supabaseService } from "../../lib/supabaseClient.ts";
import { ragService } from "../../lib/ragService.ts";
import { ChatService } from "../../lib/chatService.ts";
import type {
  SendMessageRequest,
  SendMessageResponse,
} from "../../../shared/types/chat.ts";

export async function sendChatMessage(c: Context) {
  try {
    const startTime = Date.now();
    console.log("🔥 sendChatMessage function called!");

    // Extract project ID from URL
    const projectId = c.req.param("projectId");
    console.log("📋 Project ID:", projectId);

    if (!projectId) {
      console.log("❌ No project ID provided");
      return c.json({
        success: false,
        error: "Project ID is required",
      }, 400);
    }

    // Parse request body
    const body = await c.req.json() as SendMessageRequest;
    const { message, conversation_id, options = {} } = body;

    if (!message?.trim()) {
      return c.json({
        success: false,
        error: "Message is required",
      }, 400);
    }

    console.log(`💬 Chat message request - Project: ${projectId}`);

    // Get user from auth
    const authHeader = c.req.header("Authorization");
    const user = await supabaseService.getUserFromToken(
      authHeader?.replace("Bearer ", "") || "",
    );

    if (!user) {
      return c.json({
        success: false,
        error: "Unauthorized",
      }, 401);
    }

    // Verify user has access to project
    const hasAccess = await supabaseService.userHasProjectAccess(
      user.id,
      projectId,
    );

    if (!hasAccess) {
      return c.json({
        success: false,
        error: "Access denied to this project",
      }, 403);
    }

    // Initialize chat service
    const chatService = new ChatService(supabaseService.getClient());

    // Get or create conversation
    let conversationId = conversation_id;
    if (!conversationId) {
      const conversation = await chatService.getOrCreateConversation(
        projectId,
        user.id,
      );
      conversationId = conversation.id;
      console.log(`📝 Created new conversation: ${conversationId}`);
    }

    // Get conversation history if requested
    let conversationContext = "";
    const useHistory = options.use_conversation_history !== false; // Default true

    if (useHistory) {
      const maxHistoryMessages = options.max_history_messages || 6;
      const recentMessages = await chatService.getRecentMessagesForContext(
        conversationId,
        maxHistoryMessages,
      );

      if (recentMessages.length > 0) {
        conversationContext = chatService.buildConversationalContext(
          recentMessages,
        );
        console.log(
          `🔄 Including ${recentMessages.length} previous messages for context`,
        );
      }
    }

    // Save user message
    const userMessage = await chatService.saveUserMessage(
      conversationId,
      message,
    );

    console.log(`👤 User message saved: ${userMessage.id}`);

    // Execute RAG query with conversation context
    const ragOptions = {
      max_chunks: options.max_chunks || 5,
      similarity_threshold: options.similarity_threshold || 0.6,
      use_short_context: false,
      max_context_length: 4000,
      conversation_history: conversationContext, // Pass to RAG service
    };

    const ragResult = await ragService.queryProject(
      projectId,
      user.id,
      message,
      ragOptions,
    );

    console.log(
      `🤖 RAG query completed - ${ragResult.citations.length} citations`,
    );

    // Save assistant message with citations
    const assistantMessage = await chatService.saveAssistantMessage(
      conversationId,
      ragResult.answer,
      ragResult,
    );

    console.log(`🤖 Assistant message saved: ${assistantMessage.id}`);

    // Fetch citations for response
    const { data: citations } = await supabaseService.getClient()
      .from("chat_citations")
      .select("*")
      .eq("message_id", assistantMessage.id)
      .order("similarity_score", { ascending: false });

    const totalTime = Date.now() - startTime;
    console.log(`✅ Chat message processed in ${totalTime}ms`);

    // Format response
    const response: SendMessageResponse = {
      success: true,
      conversation_id: conversationId,
      user_message: userMessage,
      assistant_message: {
        ...assistantMessage,
        citations: citations || [],
      },
      citations: citations || [],
      metadata: {
        processing_time_ms: totalTime,
        chunks_retrieved: ragResult.metadata.chunks_retrieved,
        context_length: ragResult.metadata.context_length,
        llm_model: ragResult.metadata.llm_model,
      },
    };

    return c.json(response);
  } catch (error) {
    console.error("Chat message endpoint failed:", error);

    return c.json({
      success: false,
      error: "Failed to process message",
      details: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
}
