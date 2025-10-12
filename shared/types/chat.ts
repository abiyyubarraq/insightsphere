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

export interface ChatMessageMetadata {
    // For user messages
    query_length?: number;

    // For assistant messages
    chunks_retrieved?: number;
    chunks_used?: number;
    avg_similarity?: number;
    processing_time_ms?: number;
    llm_model?: string;
    embedding_model?: string;
    context_length?: number;
    context_tokens?: number;
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
        similarity_threshold?: number;
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
    };
}

export interface GetConversationHistoryRequest {
    conversation_id: string;
    limit?: number;
    before_message_id?: string; // For pagination
}

export interface GetConversationHistoryResponse {
    success: boolean;
    conversation: ChatConversation;
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
