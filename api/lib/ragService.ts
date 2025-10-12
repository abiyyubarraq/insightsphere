/**
 * RAG Service - Complete Query Orchestration
 * Handles: Query embedding → Vector search → Context building → LLM generation
 */

import { qdrantService } from "./qdrantClient.ts";
// import { openaiClient } from "./openaiClient.ts";
// import { embeddingClient } from "./embeddingClient.ts"; // Removed - no longer using fallback embeddings
import { llmClient, type LLMResponse } from "./llmClient.ts";
import { type Citation, citationService } from "./citationService.ts";
import { openaiClient } from "./openaiClient.ts";

export interface RAGQueryOptions {
  max_chunks?: number;
  similarity_threshold?: number;
  use_short_context?: boolean;
  max_context_length?: number;
  conversation_history?: string; // Optional conversation context
}

export interface RAGQueryResult {
  answer: string;
  citations: Citation[];
  metadata: {
    query: string;
    project_id: string;
    chunks_retrieved: number;
    chunks_used: number;
    avg_similarity: number;
    embedding_model: string;
    llm_model: string;
    processing_time_ms: number;
    context_length: number;
  };
}

export class RAGService {
  /**
   * Main RAG query processing pipeline
   */
  async queryProject(
    projectId: string,
    userId: string,
    query: string,
    options: RAGQueryOptions = {},
  ): Promise<RAGQueryResult> {
    const startTime = Date.now();
    console.log(`🔍 Starting RAG query for project: ${projectId}`);
    console.log(`❓ Query: "${query}"`);

    const {
      max_chunks = 5,
      similarity_threshold = 0.3, // Lowered from 0.6 to 0.3 for better results
      use_short_context = false,
      max_context_length = 4000,
      conversation_history,
    } = options;

    try {
      // Step 1: Generate query embedding
      const { queryEmbedding, embeddingModel } = await this
        .generateQueryEmbedding(query);

      // Step 2: Search Qdrant for relevant chunks
      console.log(
        `🔍 Searching Qdrant with query embedding (${queryEmbedding.length} dimensions)...`,
      );
      console.log(
        `📋 Search params: userId=${userId}, projectId=${projectId}, useProjectCollection=true, limit=${max_chunks}, threshold=${similarity_threshold}`,
      );

      const searchResults = await qdrantService.searchSimilar(queryEmbedding, {
        userId,
        projectId,
        useProjectCollection: true,
        limit: max_chunks,
        threshold: similarity_threshold,
      });

      console.log(
        `📊 Found ${searchResults.length} relevant chunks (threshold: ${similarity_threshold})`,
      );

      // Debug: Log search results if any found
      if (searchResults.length > 0) {
        console.log(`🎯 Top result similarity: ${searchResults[0].score}`);
        console.log(
          `📄 Top result content preview: ${
            searchResults[0].content.substring(0, 100)
          }...`,
        );
      } else {
        console.log(`⚠️ No results found. This could indicate:`);
        console.log(`   - No documents processed for this project`);
        console.log(`   - Embedding dimension mismatch`);
        console.log(
          `   - Similarity threshold too high (${similarity_threshold})`,
        );
        console.log(`   - Collection not found or empty`);
      }

      if (searchResults.length === 0) {
        return this.createNoResultsResponse(
          query,
          projectId,
          embeddingModel,
          Date.now() - startTime,
        );
      }

      // Step 3: Build context and citations
      const ragContext = use_short_context
        ? citationService.createShortContext(searchResults, max_context_length)
        : citationService.buildContext(searchResults);

      console.log(
        `📝 Context built: ${ragContext.formatted_context.length} characters`,
      );

      // Step 4: Generate LLM response with optional conversation history
      const llmResponse = await this.generateLLMResponse(
        ragContext.formatted_context,
        query,
        conversation_history,
      );

      console.log(
        `🤖 LLM response generated: ${llmResponse.answer.length} characters`,
      );

      // Step 5: Format final result
      const processingTime = Date.now() - startTime;

      return {
        answer: llmResponse.answer,
        citations: ragContext.citations,
        metadata: {
          query,
          project_id: projectId,
          chunks_retrieved: searchResults.length,
          chunks_used: ragContext.total_chunks,
          avg_similarity: ragContext.avg_similarity,
          embedding_model: embeddingModel,
          llm_model: llmResponse.model,
          processing_time_ms: processingTime,
          context_length: ragContext.formatted_context.length,
        },
      };
    } catch (error) {
      console.error("RAG query failed:", error);
      throw new Error(
        `RAG query failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  /**
   * Generate embedding for query using same model as documents
   * CRITICAL: Must use the same embedding model and dimensions as document processing
   */
  private async generateQueryEmbedding(query: string): Promise<{
    queryEmbedding: number[];
    embeddingModel: string;
  }> {
    let queryEmbedding: number[] = [];
    let embeddingModel = "text-embedding-3-small";

    try {
      // CRITICAL: Use the same model as document processing to ensure dimension consistency
      console.log(
        "🤖 Generating OpenAI embedding for query (same as document processing)...",
      );
      const embedding = await openaiClient.generateEmbedding({
        text: query,
        model: "text-embedding-3-small", // Must match document processing
      });
      queryEmbedding = embedding.embedding;
      embeddingModel = "text-embedding-3-small";
      console.log(
        `✅ Generated OpenAI embedding (${queryEmbedding.length} dimensions) - matches document processing`,
      );
    } catch (openaiError) {
      console.error("❌ OpenAI embedding failed:", openaiError);

      throw new Error(
        `OpenAI embedding failed and fallback would create dimension mismatch. ` +
          `Documents were processed with text-embedding-3-small (1536 dims), ` +
          `but fallback would use different dimensions. Please fix OpenAI API key or configuration. ` +
          `Error: ${
            openaiError instanceof Error ? openaiError.message : "Unknown error"
          }`,
      );
    }

    return { queryEmbedding, embeddingModel };
  }

  /**
   * Generate LLM response using context and query
   */
  private async generateLLMResponse(
    context: string,
    query: string,
    conversationHistory?: string,
  ): Promise<LLMResponse> {
    try {
      return await llmClient.generateAnswer(
        context,
        query,
        conversationHistory,
      );
    } catch (error) {
      console.error("LLM generation failed:", error);

      // Enhanced fallback response with context summary
      const contextPreview = context.length > 200
        ? context.substring(0, 200) + "..."
        : context;

      return {
        answer:
          `I apologize, but I'm experiencing technical difficulties with the AI language models. However, I found relevant information in your documents that may help answer your question about "${query}". Here's a preview of the relevant content: "${contextPreview}". Please try again later for a complete AI-generated response, or review the citations below for detailed information.`,
        model: "fallback-with-context",
        usage: {
          input_tokens: Math.ceil(context.length / 4),
          output_tokens: 50,
          total_tokens: Math.ceil(context.length / 4) + 50,
        },
      };
    }
  }

  /**
   * Create response when no relevant chunks are found
   */
  private createNoResultsResponse(
    query: string,
    projectId: string,
    embeddingModel: string,
    processingTime: number,
  ): RAGQueryResult {
    return {
      answer:
        "I don't have enough relevant information in the uploaded documents to answer this question. You might want to try rephrasing your query or upload additional documents related to your question.",
      citations: [],
      metadata: {
        query,
        project_id: projectId,
        chunks_retrieved: 0,
        chunks_used: 0,
        avg_similarity: 0,
        embedding_model: embeddingModel,
        llm_model: "none",
        processing_time_ms: processingTime,
        context_length: 0,
      },
    };
  }

  /**
   * Test RAG pipeline with sample data (for debugging)
   */
  async testRAGPipeline(
    projectId: string,
    userId: string,
    query: string = "What are the main topics covered in these documents?",
  ): Promise<{
    success: boolean;
    result?: RAGQueryResult;
    error?: string;
    steps: Array<{
      step: string;
      status: "success" | "error";
      message: string;
      duration_ms?: number;
    }>;
  }> {
    const steps: Array<{
      step: string;
      status: "success" | "error";
      message: string;
      duration_ms?: number;
    }> = [];

    try {
      // Test vector search
      const searchStart = Date.now();
      try {
        const { queryEmbedding, embeddingModel } = await this
          .generateQueryEmbedding(query);
        const searchResults = await qdrantService.searchSimilar(
          queryEmbedding,
          {
            userId,
            projectId,
            useProjectCollection: true,
            // limit: 20,
            threshold: 0.3,
          },
        );
        steps.push({
          step: "vector_search",
          status: "success",
          message:
            `Found ${searchResults.length} relevant chunks using ${embeddingModel}`,
          duration_ms: Date.now() - searchStart,
        });
      } catch (error) {
        steps.push({
          step: "vector_search",
          status: "error",
          message: `Vector search failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          duration_ms: Date.now() - searchStart,
        });
        throw error;
      }

      // Test full RAG pipeline
      const ragStart = Date.now();
      try {
        const result = await this.queryProject(projectId, userId, query, {
          // max_chunks: 3,
          similarity_threshold: 0.3, // Lowered from 0.5 to 0.3
        });
        steps.push({
          step: "rag_generation",
          status: "success",
          message: `Generated answer with ${result.citations.length} citations`,
          duration_ms: Date.now() - ragStart,
        });

        return {
          success: true,
          result,
          steps,
        };
      } catch (error) {
        steps.push({
          step: "rag_generation",
          status: "error",
          message: `RAG generation failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          duration_ms: Date.now() - ragStart,
        });
        throw error;
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        steps,
      };
    }
  }
}

// Export singleton instance
export const ragService = new RAGService();
