/**
 * Chat conversation types for conversational RAG
 */

export interface ChatConversation {
    id: string;
    project_id: string;
    user_id: string;
    title: string;
    created_at: string;
    updated_at: string;
}

export interface ChatMessage {
    id: string;
    conversation_id: string;
    role: "user" | "assistant" | "system";
    content: string;
    created_at: string;
    query_embedding?: number[]; // Optional: for analytics/reuse
    metadata?: ChatMessageMetadata;
    citations?: ChatCitation[]; // Populated when fetching assistant messages
}

/**
 * How the API answered. `fallback` means the question router failed or its
 * pick could not be used, and the normal search path answered instead.
 */
export type ChatRoute = "overview" | "specific" | "off_topic" | "fallback";

export interface ChatMessageMetadata {
    // For user messages
    query_length?: number;

    // For assistant messages
    chunks_retrieved?: number;
    chunks_used?: number;
    avg_similarity?: number;
    /** Best cosine score among the chunks used. */
    top_similarity?: number;
    /**
     * The best chunk scored below the sufficiency floor, so the answer rests on
     * a weak match. Stored on the message rather than the response envelope so
     * it survives a reload of the conversation, and set by the API so the UI
     * never has to know what the floor is.
     */
    low_confidence?: boolean;
    processing_time_ms?: number;
    llm_model?: string;
    embedding_model?: string;
    context_length?: number;
    context_tokens?: number;
    /** Absent on messages saved before the router existed. */
    route?: ChatRoute;
    /** Questions to offer instead, only on an off_topic reply. */
    suggestions?: string[];
}

export interface ChatCitation {
    id: string;
    message_id: string;
    document_id: string;
    file_name: string;
    page_number?: number;
    chunk_index: number;
    similarity_score: number;
    text_snippet: string;
    created_at: string;
}

// API Request/Response types
export interface SendMessageRequest {
    conversation_id?: string; // Optional: create new if not provided
    message: string;
    options?: {
        max_chunks?: number;
        use_conversation_history?: boolean; // Include previous context
        max_history_messages?: number; // How many previous messages to include
    };
}

export interface SendMessageResponse {
    success: boolean;
    conversation_id: string;
    user_message: ChatMessage;
    assistant_message: ChatMessage;
    citations: ChatCitation[];
    metadata: {
        processing_time_ms: number;
        chunks_retrieved: number;
        context_length: number;
        llm_model: string;
        route: ChatRoute;
    };
}

export interface QuerySuggestionsResponse {
    success: boolean;
    project_id: string;
    suggestions: string[];
    source: "generated" | "fallback" | "empty";
    generated_at: string;
}

export interface GetConversationHistoryRequest {
    conversation_id: string;
    limit?: number;
    before_message_id?: string; // For pagination
}

export interface GetConversationHistoryResponse {
    success: boolean;
    conversation: ChatConversation | null;
    messages: ChatMessage[]; // Includes citations for assistant messages
    has_more: boolean;
}

export interface CreateConversationRequest {
    project_id: string;
    title?: string;
}

export interface CreateConversationResponse {
    success: boolean;
    conversation: ChatConversation;
}

// Frontend UI State
export interface ChatUIMessage extends ChatMessage {
    loading?: boolean; // For streaming/loading states
    error?: string; // For error handling
}
