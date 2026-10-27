/**
 * RAG Service - Complete Query Orchestration
 * Handles: Query contextualisation → embedding → vector search → context building → LLM generation
 */

import { qdrantService, type QdrantService } from "./qdrantClient.ts";
import { SEARCH_DEFAULTS } from "./constants.ts";
import {
  type AnswerOptions,
  LLMClientFactory,
  type LLMResponse,
} from "./llmClient.ts";
import { type Citation, citationService } from "./citationService.ts";
import { keepValidCitationIds } from "./citationMarkers.ts";
import type { OpenAIClient } from "./openaiClient.ts";
import { OpenAIRequestError, userKeyFailure } from "./openaiErrors.ts";
import type { ChosenClient } from "./openaiForUser.ts";
import {
  type CompleteRewrite,
  contextualiseQuery,
  type HistoryTurn,
  REWRITE_MAX_TOKENS,
  REWRITE_MODEL,
} from "./queryRewrite.ts";
import {
  type CompleteRoute,
  ROUTER_MAX_TOKENS,
  ROUTER_MODEL,
  routeQuestion,
} from "./questionRouter.ts";
import { buildOverview } from "./overview.ts";
import {
  FALLBACK_SUGGESTIONS,
  type LoadSummaries,
  SUGGESTION_MAX_DOCS,
  type SuggestionDoc,
} from "./suggestions.ts";
import type { ChatRoute } from "../../shared/types/chat.ts";
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
    route: ChatRoute;
    /** Only on an off_topic reply. */
    suggestions?: string[];
  };
}

/**
 * The project's documents, for the router and the overview path. Built per
 * request from a project id the route has already checked access to.
 */
export interface ProjectKnowledge {
  /** Every ready document, newest first. */
  listDocuments(): Promise<SuggestionDoc[]>;
  loadSummaries: LoadSummaries;
  /** Example questions; may fall back to a fixed list. */
  suggestions(docs: SuggestionDoc[]): Promise<string[]>;
}

export const OFF_TOPIC_ANSWER =
  "I can only answer from the documents in this project. Try one of these:";
export const OFF_TOPIC_CHIPS = 3;

export type RAGOpenAI = Pick<
  OpenAIClient,
  "generateEmbedding" | "generateChatCompletion"
>;

type SearchSimilar = QdrantService["searchSimilar"];

/**
 * One instance serves every request, so the OpenAI client is a parameter of
 * each call and never stored on the instance. Stored, two requests at the same
 * time could swap keys and one user's key would pay for another's question.
 */
export class RAGService {
  constructor(
    private readonly searchSimilar: SearchSimilar = (vector, options) =>
      qdrantService.searchSimilar(vector, options),
  ) {}

  /**
   * Main RAG query processing pipeline
   */
  async queryProject(
    projectId: string,
    userId: string,
    query: string,
    openai: ChosenClient<RAGOpenAI>,
    options: RAGQueryOptions = {},
    /** Absent: no router runs and every question takes the search path. */
    knowledge?: ProjectKnowledge,
  ): Promise<RAGQueryResult> {
    const { client, own } = openai;
    const startTime = Date.now();
    console.log(`🔍 Starting RAG query for project: ${projectId}`);
    console.log(`❓ Query length: ${query.length}`);

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
        this.rewriteWith(client),
      );

      console.log(
        rewritten
          ? `✏️ Rewritten for retrieval (${query.length} -> ${searchQuery.length} chars)`
          : `✏️ No rewrite (${
            conversation_turns.length === 0 ? "first turn" : "kept original"
          })`,
      );

      // Step 2: Decide the kind of question, on its rewritten form so a
      // follow-up is judged by what it means.
      let route: ChatRoute = "specific";
      if (knowledge) {
        const picked = await this.pickRoute(searchQuery, knowledge, client);
        if (picked.route === "off_topic") {
          return await this.offTopicResponse(
            query,
            searchQuery,
            projectId,
            knowledge,
            picked.docs,
            startTime,
          );
        }
        if (picked.route === "overview") {
          const overview = await this.answerOverview(
            client,
            own,
            query,
            searchQuery,
            projectId,
            knowledge,
            picked.docs,
            { conversation_history, max_context_length },
            startTime,
          );
          if (overview) return overview;
          route = "fallback";
        } else {
          route = picked.route;
        }
      }

      // Step 3: Embed whichever queries we are searching with
      const queries = rewritten ? [query, searchQuery] : [query];
      const { embeddings, embeddingModel } = await this.generateQueryEmbeddings(
        client,
        queries,
      );

      // Step 4: Search Qdrant once per query, fetching deeper than the k we
      // keep. Fusing two lists of 5 gives RRF almost nothing to agree on, and a
      // chunk ranked 6th by both phrasings could never surface. Qdrant
      // prefetches 100 for its own fusion; this costs one query either way.
      const candidateLimit = Math.max(max_chunks * CANDIDATE_DEPTH, 20);

      console.log(
        `📋 Search: userId=${userId}, projectId=${projectId}, candidates=${candidateLimit}, keep=${max_chunks}, threshold=${similarity_threshold}`,
      );

      const lists = await Promise.all(
        embeddings.map((queryEmbedding) =>
          this.searchSimilar(queryEmbedding, {
            userId,
            projectId,
            useProjectCollection: true,
            limit: candidateLimit,
            threshold: similarity_threshold,
          })
        ),
      );

      // Step 5: Fuse, drop duplicate passages, take the top k, then order by
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
          route,
        );
      }

      // Step 6: Build context and citations
      const ragContext = use_short_context
        ? citationService.createShortContext(searchResults, max_context_length)
        : citationService.buildContext(searchResults);

      console.log(
        `📝 Context built: ${ragContext.formatted_context.length} characters`,
      );

      // Step 7: Answer, saying so when the context is only a weak match
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
        client,
        own,
        ragContext.formatted_context,
        query,
        {
          conversationHistory: conversation_history,
          lowConfidence: low_confidence,
          sourceCount: ragContext.total_chunks,
        },
      );
      // The model can still cite a number the context does not have. The
      // frontend maps N to the Nth source, so such a chip opens nothing.
      const answer = keepValidCitationIds(
        llmResponse.answer,
        ragContext.total_chunks,
      );

      console.log(
        `🤖 LLM response generated: ${llmResponse.answer.length} characters, ${
          llmResponse.answer.length - answer.length
        } removed with invalid citations`,
      );

      return {
        answer,
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
          route,
        },
      };
    } catch (error) {
      console.error("RAG query failed:", error);
      if (error instanceof OpenAIRequestError) throw error;
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
   * any OpenAI client and can be tested.
   */
  private rewriteWith(client: RAGOpenAI): CompleteRewrite {
    return async (messages, signal) => {
      const result = await client.generateChatCompletion({
        model: REWRITE_MODEL,
        messages,
        max_tokens: REWRITE_MAX_TOKENS,
        temperature: 0,
        signal,
      });
      return result.answer;
    };
  }

  private routeWith(client: RAGOpenAI): CompleteRoute {
    return async (messages, signal) => {
      const result = await client.generateChatCompletion({
        model: ROUTER_MODEL,
        messages,
        max_tokens: ROUTER_MAX_TOKENS,
        temperature: 0,
        signal,
      });
      return result.answer;
    };
  }

  /**
   * "fallback" when the router or the document list failed. With no ready
   * documents the router is skipped: search gives the usual "not enough
   * information" answer.
   */
  private async pickRoute(
    question: string,
    knowledge: ProjectKnowledge,
    client: RAGOpenAI,
  ): Promise<{ route: ChatRoute; docs: SuggestionDoc[] }> {
    let docs: SuggestionDoc[];
    try {
      docs = await knowledge.listDocuments();
    } catch {
      console.warn("🧭 Router skipped: documents could not be listed");
      return { route: "fallback", docs: [] };
    }
    if (docs.length === 0) return { route: "specific", docs };

    const { route, failed } = await routeQuestion(
      question,
      docs.map((doc) => doc.file_name),
      this.routeWith(client),
    );
    return { route: failed ? "fallback" : route, docs };
  }

  /**
   * One numbered source per document with a summary. Null when there is no
   * summary to answer from, so the caller can search instead.
   */
  private async answerOverview(
    client: RAGOpenAI,
    own: boolean,
    query: string,
    searchQuery: string,
    projectId: string,
    knowledge: ProjectKnowledge,
    docs: SuggestionDoc[],
    options: { conversation_history?: string; max_context_length: number },
    startTime: number,
  ): Promise<RAGQueryResult | null> {
    const ids = docs
      .slice(0, SUGGESTION_MAX_DOCS)
      .filter((doc) => doc.is_summary_exist)
      .map((doc) => doc.id);
    let summaries = new Map<string, string | null>();
    if (ids.length > 0) {
      try {
        summaries = await knowledge.loadSummaries(ids);
      } catch {
        console.warn("📚 Overview fell back: summaries could not be read");
        return null;
      }
    }

    const overview = buildOverview(
      docs.map((doc) => ({
        id: doc.id,
        file_name: doc.file_name,
        summary: summaries.get(doc.id) ?? null,
        updated_at: doc.updated_at,
      })),
      options.max_context_length,
    );
    if (overview.total_chunks === 0) {
      console.warn("📚 Overview fell back: no document has a summary");
      return null;
    }

    console.log(
      `📚 Overview from ${overview.total_chunks} summaries, ${overview.listedOnly.length} listed by name, ${overview.formatted_context.length} characters`,
    );

    const llmResponse = await this.generateLLMResponse(
      client,
      own,
      overview.formatted_context,
      query,
      {
        conversationHistory: options.conversation_history,
        sourceCount: overview.total_chunks,
        overview: true,
      },
    );

    return {
      answer: keepValidCitationIds(llmResponse.answer, overview.total_chunks),
      citations: overview.citations,
      metadata: {
        query,
        search_query: searchQuery,
        project_id: projectId,
        chunks_retrieved: overview.total_chunks,
        chunks_used: overview.total_chunks,
        avg_similarity: 0,
        top_similarity: 0,
        low_confidence: false,
        embedding_model: "none",
        llm_model: llmResponse.model,
        processing_time_ms: Date.now() - startTime,
        context_length: overview.formatted_context.length,
        route: "overview",
      },
    };
  }

  /** A fixed reply with example questions. No search and no answering call. */
  private async offTopicResponse(
    query: string,
    searchQuery: string,
    projectId: string,
    knowledge: ProjectKnowledge,
    docs: SuggestionDoc[],
    startTime: number,
  ): Promise<RAGQueryResult> {
    let suggestions: string[];
    try {
      suggestions = await knowledge.suggestions(docs);
    } catch {
      suggestions = [];
    }
    if (suggestions.length === 0) suggestions = [...FALLBACK_SUGGESTIONS];
    suggestions = suggestions.slice(0, OFF_TOPIC_CHIPS);

    console.log(`🚫 Off-topic reply with ${suggestions.length} suggestions`);

    return {
      answer: OFF_TOPIC_ANSWER,
      citations: [],
      metadata: {
        query,
        search_query: searchQuery,
        project_id: projectId,
        chunks_retrieved: 0,
        chunks_used: 0,
        avg_similarity: 0,
        top_similarity: 0,
        low_confidence: false,
        embedding_model: "none",
        llm_model: "none",
        processing_time_ms: Date.now() - startTime,
        context_length: 0,
        route: "off_topic",
        suggestions,
      },
    };
  }

  /**
   * Generate embeddings for the queries using same model as documents
   * CRITICAL: Must use the same embedding model and dimensions as document processing
   */
  private async generateQueryEmbeddings(
    client: RAGOpenAI,
    queries: string[],
  ): Promise<{
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
          const embedding = await client.generateEmbedding({
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
      if (openaiError instanceof OpenAIRequestError) throw openaiError;

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
    client: RAGOpenAI,
    own: boolean,
    context: string,
    query: string,
    options: AnswerOptions,
  ): Promise<LLMResponse> {
    try {
      return await LLMClientFactory.create(client).generateAnswer(
        context,
        query,
        options,
      );
    } catch (error) {
      console.error("LLM generation failed:", error);

      // An apology would hide a rejected or empty own key behind a 200. The
      // user has to see it, so it goes up to the route instead.
      if (own && userKeyFailure(error)) throw error;

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
    route: ChatRoute,
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
        route,
      },
    };
  }
}

// Export singleton instance
export const ragService = new RAGService();
