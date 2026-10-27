/**
 * Chat message send endpoint - Conversational RAG
 *
 * POST /v1/projects/:projectId/chat
 *
 * Handles:
 * 1. Finding the conversation, if there is one
 * 2. Retrieving relevant document chunks with RAG
 * 3. Including conversation history for context-aware responses
 * 4. Generating AI response with citations
 * 5. Creating the conversation if needed, then saving the user message and the
 *    assistant message with citations, only once the answer exists
 */

import { type Context } from "hono";
import { supabaseService } from "../../lib/supabaseClient.ts";
import { ragService } from "../../lib/ragService.ts";
import { ChatService } from "../../lib/chatService.ts";
import { SEARCH_DEFAULTS } from "../../lib/constants.ts";
import { knowledgeFor } from "../../lib/projectKnowledge.ts";
import { pickChatOptions } from "../../lib/queryOptions.ts";
import { currentUser } from "../../lib/auth.ts";
import {
  chargeUserQuota,
  quotaExceeded,
  QuotaUnavailableError,
  quotaUnavailable,
} from "../../lib/quotaService.ts";
import { keyFailureResponse } from "../../lib/openaiErrors.ts";
import { openAIForUser } from "../../lib/userOpenAI.ts";
import type { HistoryTurn } from "../../lib/queryRewrite.ts";
import { answerThenSave } from "../../lib/chatExchange.ts";
import { checkBodyConversation } from "../../lib/conversationAccess.ts";
import { historyForPrompt } from "../../lib/citationMarkers.ts";
import type {
  SendMessageRequest,
  SendMessageResponse,
} from "../../../shared/types/chat.ts";
import { errorInfo } from "../../lib/logSafe.ts";

export async function sendChatMessage(c: Context) {
  let own = false;
  try {
    const startTime = Date.now();
    const user = currentUser(c);

    // Extract project ID from URL
    const projectId = c.req.param("projectId");

    if (!projectId) {
      return c.json({
        success: false,
        error: "Project ID is required",
      }, 400);
    }

    // Parse request body
    const body = await c.req.json() as SendMessageRequest;
    const { message, conversation_id } = body;
    const options = pickChatOptions(body.options);

    if (!message?.trim()) {
      return c.json({
        success: false,
        error: "Message is required",
      }, 400);
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

    const chatService = new ChatService(supabaseService.getClient());

    // Before the OpenAI client and the quota charge, so a refused id costs
    // nothing. Runs even without history: the messages are still saved into it.
    const conversationCheck = await checkBodyConversation(
      conversation_id,
      user.id,
      projectId,
      (id) => chatService.getConversationById(id),
    );
    if (conversationCheck === "not_found") {
      return c.json({
        success: false,
        error: "Conversation not found.",
      }, 404);
    }

    // One client for the rewrite, the embedding and the answer.
    const openai = await openAIForUser(user.id);
    own = openai.own;

    // Charged before anything is saved or sent to OpenAI. Not refunded if the
    // answer later fails.
    const quota = await chargeUserQuota({ own, userId: user.id, kind: "chat" });
    if (!quota.allowed) return quotaExceeded(c, "chat", quota.limit);

    // Only looked up here. A new conversation is created after the answer.
    const existingConversationId = conversation_id ||
      (await chatService.findConversation(projectId, user.id))?.id;

    // Get conversation history if requested. Fetched before the current
    // message is saved, so the question being asked is not in its own history.
    let conversationContext = "";
    let conversationTurns: HistoryTurn[] = [];
    if (options.use_conversation_history && existingConversationId) {
      const recentMessages = await chatService.getRecentMessagesForContext(
        existingConversationId,
        options.max_history_messages,
      );

      if (recentMessages.length > 0) {
        // The same history in two shapes: formatted prose for the answering
        // model, turns for the query rewrite that retrieval depends on.
        const history = historyForPrompt(recentMessages);
        conversationContext = chatService.buildConversationalContext(
          history.messages,
        );
        conversationTurns = history.turns;
        console.log(
          `🔄 Including ${recentMessages.length} previous messages for context`,
        );
      }
    }

    // Execute RAG query with conversation context
    const ragOptions = {
      max_chunks: options.max_chunks,
      similarity_threshold: SEARCH_DEFAULTS.threshold,
      use_short_context: false,
      max_context_length: SEARCH_DEFAULTS.maxContextLength,
      conversation_history: conversationContext, // Pass to RAG service
      conversation_turns: conversationTurns, // Used to rewrite the query before retrieval
    };

    const {
      answer: ragResult,
      conversationId,
      userMessage,
      assistantMessage,
    } = await answerThenSave({
      conversationId: existingConversationId,
      answer: () =>
        ragService.queryProject(
          projectId,
          user.id,
          message,
          openai,
          ragOptions,
          knowledgeFor(projectId, openai.client),
        ),
      ensureConversation: async () => {
        const conversation = await chatService.getOrCreateConversation(
          projectId,
          user.id,
        );
        console.log(`📝 Created new conversation: ${conversation.id}`);
        return conversation.id;
      },
      saveUser: (id) => chatService.saveUserMessage(id, message),
      saveAssistant: (id, result) =>
        chatService.saveAssistantMessage(id, result.answer, result),
      deleteMessage: (saved) => chatService.deleteMessage(saved.id),
    });

    console.log(
      `🤖 RAG query completed - ${ragResult.citations.length} citations`,
    );
    console.log(`👤 User message saved: ${userMessage.id}`);
    console.log(`🤖 Assistant message saved: ${assistantMessage.id}`);

    // Fetch citations for response
    const { data: citations } = await supabaseService.getClient()
      .from("chat_citations")
      .select("*")
      .eq("message_id", assistantMessage.id)
      .order("similarity_score", { ascending: false })
      // Overview citations all score 0. Without this their order is not
      // defined, and chip N would open the wrong source.
      .order("chunk_index", { ascending: true });

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
        route: ragResult.metadata.route,
      },
    };

    return c.json(response);
  } catch (error) {
    if (error instanceof QuotaUnavailableError) {
      console.error("Quota check failed before chat:", {
        projectId: c.req.param("projectId"),
      });
      return quotaUnavailable(c);
    }
    console.error("Chat message endpoint failed:", {
      projectId: c.req.param("projectId"),
      ...errorInfo(error),
    });
    const keyFailure = keyFailureResponse(c, own, error);
    if (keyFailure) return keyFailure;

    return c.json({
      success: false,
      error: "Failed to process message",
    }, 500);
  }
}
