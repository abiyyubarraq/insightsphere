/**
 * RAG Service - Complete Query Orchestration
 * Handles: Query contextualisation → embedding → vector search → context building → LLM generation
 */

import { qdrantService } from "./qdrantClient.ts";
import { SEARCH_DEFAULTS } from "./constants.ts";
import { llmClient, type LLMResponse } from "./llmClient.ts";
import { type Citation, citationService } from "./citationService.ts";
import { openaiClient } from "./openaiClient.ts";
import {
  type CompleteRewrite,
  contextualiseQuery,
  type HistoryTurn,
  REWRITE_MAX_TOKENS,
  REWRITE_MODEL,
} from "./queryRewrite.ts";
import {
  CANDIDATE_DEPTH,
  dropDuplicateChunks,
  fuseByRRF,
  isWeakMatch,
  sortByScore,
  topScore,
} from "./retrieval.ts";

export interface RAGQueryOptions {
  max_chunks?: number;
  similarity_threshold?: number;
  use_short_context?: boolean;
  max_context_length?: number;
  /** Formatted history for the answering model. */
  conversation_history?: string;
  /**
   * The same history as turns, for the query rewrite. Absent on the one-shot
   * query endpoint, which has no conversation and must not pay for a rewrite.
   */
  conversation_turns?: HistoryTurn[];
}

export interface RAGQueryResult {
  answer: string;
  citations: Citation[];
  metadata: {
    query: string;
    /**
     * What retrieval actually searched for. Differs from query only when the
     * rewrite ran and was accepted.
     */
    search_query: string;
    project_id: string;
    chunks_retrieved: number;
    chunks_used: number;
    avg_similarity: number;
    top_similarity: number;
    low_confidence: boolean;
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
      max_chunks = SEARCH_DEFAULTS.maxChunks,
      similarity_threshold = SEARCH_DEFAULTS.threshold,
      use_short_context = false,
      max_context_length = SEARCH_DEFAULTS.maxContextLength,
      conversation_history,
      conversation_turns = [],
    } = options;

    try {
      // Step 1: Turn a follow-up into a question that can be searched for.
      // With no history this returns immediately and makes no network call.
      const { searchQuery, rewritten } = await contextualiseQuery(
        query,
        conversation_turns,
        this.completeRewrite,
      );

      // Logged as a pair on purpose: the effect of a rewrite can only be judged
      // against the question it replaced, on this corpus.
      console.log(
        rewritten
          ? `✏️ Rewritten for retrieval: "${query}" -> "${searchQuery}"`
          : `✏️ No rewrite (${
            conversation_turns.length === 0 ? "first turn" : "kept original"
          })`,
      );

      // Step 2: Embed whichever queries we are searching with
      const queries = rewritten ? [query, searchQuery] : [query];
      const { embeddings, embeddingModel } = await this.generateQueryEmbeddings(
        queries,
      );

      // Step 3: Search Qdrant once per query, fetching deeper than the k we
      // keep. Fusing two lists of 5 gives RRF almost nothing to agree on, and a
      // chunk ranked 6th by both phrasings could never surface. Qdrant
      // prefetches 100 for its own fusion; this costs one query either way.
      const candidateLimit = Math.max(max_chunks * CANDIDATE_DEPTH, 20);

      console.log(
        `📋 Search: userId=${userId}, projectId=${projectId}, candidates=${candidateLimit}, keep=${max_chunks}, threshold=${similarity_threshold}`,
      );

      const lists = await Promise.all(
        embeddings.map((queryEmbedding) =>
          qdrantService.searchSimilar(queryEmbedding, {
            userId,
            projectId,
            useProjectCollection: true,
            limit: candidateLimit,
            threshold: similarity_threshold,
          })
        ),
      );

      // Step 4: Fuse, drop duplicate passages, take the top k, then order by
      // score. Fusion decides which chunks survive; score decides the order the
      // model and the UI see, which is what citation numbers depend on.
      const fused = dropDuplicateChunks(fuseByRRF(lists));
      const searchResults = sortByScore(fused.slice(0, max_chunks));

      console.log(
        `📊 ${lists.map((list) => list.length).join(" + ")} hits -> ${
          fused.length
        } after fusion and de-duplication -> ${searchResults.length} used (threshold: ${similarity_threshold})`,
      );

      if (searchResults.length > 0) {
        console.log(`🎯 Top result similarity: ${searchResults[0].score}`);
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
          searchQuery,
          projectId,
          embeddingModel,
          Date.now() - startTime,
        );
      }

      // Step 5: Build context and citations
      const ragContext = use_short_context
        ? citationService.createShortContext(searchResults, max_context_length)
        : citationService.buildContext(searchResults);

      console.log(
        `📝 Context built: ${ragContext.formatted_context.length} characters`,
      );

      // Step 6: Answer, saying so when the context is only a weak match
      const top_similarity = topScore(searchResults);
      const low_confidence = isWeakMatch(searchResults);

      if (low_confidence) {
        console.log(
          `⚠️ Weak match: top score ${
            top_similarity.toFixed(3)
          } is below the sufficiency floor`,
        );
      }

      const llmResponse = await this.generateLLMResponse(
        ragContext.formatted_context,
        query,
        {
          conversationHistory: conversation_history,
          lowConfidence: low_confidence,
        },
      );

      console.log(
        `🤖 LLM response generated: ${llmResponse.answer.length} characters`,
      );

      return {
        answer: llmResponse.answer,
        citations: ragContext.citations,
        metadata: {
          query,
          search_query: searchQuery,
          project_id: projectId,
          chunks_retrieved: searchResults.length,
          chunks_used: ragContext.total_chunks,
          avg_similarity: ragContext.avg_similarity,
          top_similarity,
          low_confidence,
          embedding_model: embeddingModel,
          llm_model: llmResponse.model,
          processing_time_ms: Date.now() - startTime,
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
   * The rewrite runs on the cheap model at temperature 0. It is passed into
   * contextualiseQuery rather than imported by it, so that module stays free of
   * the OpenAI singleton and can be tested.
   */
  private completeRewrite: CompleteRewrite = async (messages, signal) => {
    const result = await openaiClient.generateChatCompletion({
      model: REWRITE_MODEL,
      messages,
      max_tokens: REWRITE_MAX_TOKENS,
      temperature: 0,
      signal,
    });
    return result.answer;
  };

  /**
   * Generate embeddings for the queries using same model as documents
   * CRITICAL: Must use the same embedding model and dimensions as document processing
   */
  private async generateQueryEmbeddings(queries: string[]): Promise<{
    embeddings: number[][];
    embeddingModel: string;
  }> {
    try {
      console.log(
        `🤖 Generating OpenAI embeddings for ${queries.length} quer${
          queries.length === 1 ? "y" : "ies"
        } (same as document processing)...`,
      );

      const embeddings = await Promise.all(
        queries.map(async (text) => {
          const embedding = await openaiClient.generateEmbedding({
            text,
            model: "text-embedding-3-small", // Must match document processing
          });
          return embedding.embedding;
        }),
      );

      console.log(
        `✅ Generated OpenAI embeddings (${embeddings[0].length} dimensions) - matches document processing`,
      );

      return { embeddings, embeddingModel: "text-embedding-3-small" };
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
  }

  /**
   * Generate LLM response using context and query
   */
  private async generateLLMResponse(
    context: string,
    query: string,
    options: { conversationHistory?: string; lowConfidence?: boolean },
  ): Promise<LLMResponse> {
    try {
      return await llmClient.generateAnswer(context, query, options);
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
    searchQuery: string,
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
        search_query: searchQuery,
        project_id: projectId,
        chunks_retrieved: 0,
        chunks_used: 0,
        avg_similarity: 0,
        top_similarity: 0,
        low_confidence: true,
        embedding_model: embeddingModel,
        llm_model: "none",
        processing_time_ms: processingTime,
        context_length: 0,
      },
    };
  }
}

// Export singleton instance
export const ragService = new RAGService();
