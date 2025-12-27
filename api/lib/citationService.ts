/**
 * Citation Service for RAG Query Responses
 * Formats search results into structured citations with sources
 */

import type { SearchResult } from "./qdrantClient.ts";

export interface Citation {
	document_id: string;
	file_name: string;
	page_number?: number;
	chunk_index: number;
	similarity_score: number;
	text_snippet: string;
	created_at: string;
}

export interface RAGContext {
	formatted_context: string;
	citations: Citation[];
	total_chunks: number;
	avg_similarity: number;
}

export class CitationService {
	/**
	 * Convert Qdrant search results into structured citations
	 */
	formatCitations(searchResults: SearchResult[]): Citation[] {
		return searchResults.map(result => ({
			document_id: result.metadata.documentId,
			file_name: result.metadata.fileName,
			page_number: result.metadata.pageNumber,
			chunk_index: result.metadata.chunkIndex,
			similarity_score: result.score,
			text_snippet: this.truncateText(result.content, 200),
			created_at: result.metadata.createdAt
		}));
	}

	/**
	 * Build context string for LLM prompt from search results
	 * Format: [doc_id: N] to enable proper citation parsing in frontend
	 */
	buildContext(searchResults: SearchResult[]): RAGContext {
		const citations = this.formatCitations(searchResults);

		// Build formatted context for LLM with explicit doc_id format
		const contextParts = searchResults.map((result, index) => {
			const docId = index + 1;
			const pageInfo = result.metadata.pageNumber ? `, Page ${result.metadata.pageNumber}` : "";
			const header = `[doc_id: ${docId}] Source: ${result.metadata.fileName}${pageInfo}`;
			const content = result.content.trim();

			return `${header}\n${content}`;
		});

		const formatted_context = contextParts.join('\n\n---\n\n');

		// Calculate metadata
		const total_chunks = searchResults.length;
		const avg_similarity = total_chunks > 0 
			? searchResults.reduce((sum, result) => sum + result.score, 0) / total_chunks 
			: 0;

		console.log(`📖 Built context from ${total_chunks} chunks, avg similarity: ${avg_similarity.toFixed(3)}`);

		return {
			formatted_context,
			citations,
			total_chunks,
			avg_similarity
		};
	}

	/**
	 * Filter citations by minimum similarity score
	 */
	filterByRelevance(citations: Citation[], minScore = 0.5): Citation[] {
		return citations.filter(citation => citation.similarity_score >= minScore);
	}

	/**
	 * Group citations by document for better organization
	 */
	groupByDocument(citations: Citation[]): Record<string, Citation[]> {
		return citations.reduce((groups, citation) => {
			const docId = citation.document_id;
			if (!groups[docId]) {
				groups[docId] = [];
			}
			groups[docId].push(citation);
			return groups;
		}, {} as Record<string, Citation[]>);
	}

	/**
	 * Create a summary of citation sources
	 */
	createSourceSummary(citations: Citation[]): {
		total_sources: number;
		documents: Array<{
			document_id: string;
			file_name: string;
			chunks_used: number;
			avg_score: number;
			pages: number[];
		}>;
		score_range: {
			min: number;
			max: number;
			avg: number;
		};
	} {
		const grouped = this.groupByDocument(citations);
		
		const documents = Object.entries(grouped).map(([docId, docCitations]) => {
			const avgScore = docCitations.reduce((sum, c) => sum + c.similarity_score, 0) / docCitations.length;
			const pages = [...new Set(docCitations.map(c => c.page_number).filter(p => p !== undefined))].sort((a, b) => (a || 0) - (b || 0));
			
			return {
				document_id: docId,
				file_name: docCitations[0].file_name,
				chunks_used: docCitations.length,
				avg_score: avgScore,
				pages: pages as number[]
			};
		});

		const scores = citations.map(c => c.similarity_score);
		const score_range = {
			min: Math.min(...scores),
			max: Math.max(...scores),
			avg: scores.reduce((sum, score) => sum + score, 0) / scores.length
		};

		return {
			total_sources: citations.length,
			documents,
			score_range
		};
	}

	/**
	 * Format citations for display in frontend
	 */
	formatForDisplay(citations: Citation[]): Array<{
		id: string;
		source: string;
		snippet: string;
		score: string;
		location: string;
	}> {
		return citations.map((citation, index) => {
			const pageInfo = citation.page_number ? ` • Page ${citation.page_number}` : "";
			const location = `${citation.file_name}${pageInfo} • Chunk ${citation.chunk_index}`;
			
			return {
				id: `citation-${index}`,
				source: citation.file_name,
				snippet: citation.text_snippet,
				score: `${(citation.similarity_score * 100).toFixed(1)}%`,
				location
			};
		});
	}

	/**
	 * Create a shortened context for token-limited models
	 */
	createShortContext(searchResults: SearchResult[], maxLength = 3000): RAGContext {
		let currentLength = 0;
		const filteredResults: SearchResult[] = [];

		// Include results until we hit the length limit
		for (const result of searchResults) {
			const additionalLength = result.content.length + 100; // Buffer for formatting
			if (currentLength + additionalLength > maxLength && filteredResults.length > 0) {
				break;
			}
			filteredResults.push(result);
			currentLength += additionalLength;
		}

		console.log(`📏 Shortened context from ${searchResults.length} to ${filteredResults.length} chunks (${currentLength} chars)`);
		
		return this.buildContext(filteredResults);
	}

	/**
	 * Truncate text to specified length with ellipsis
	 */
	private truncateText(text: string, maxLength: number): string {
		if (text.length <= maxLength) {
			return text;
		}
		
		// Try to break at sentence boundary
		const truncated = text.substring(0, maxLength);
		const lastPeriod = truncated.lastIndexOf('.');
		const lastSpace = truncated.lastIndexOf(' ');
		
		if (lastPeriod > maxLength * 0.8) {
			return truncated.substring(0, lastPeriod + 1);
		} else if (lastSpace > maxLength * 0.8) {
			return truncated.substring(0, lastSpace) + '...';
		} else {
			return truncated + '...';
		}
	}
}

// Export singleton instance
export const citationService = new CitationService();
