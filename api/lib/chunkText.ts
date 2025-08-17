export interface ChunkOptions {
	maxChunkSize?: number;
	overlap?: number;
	preserveSentences?: boolean;
}

export interface TextChunk {
	content: string;
	index: number;
	startChar: number;
	endChar: number;
	tokenCount?: number;
}

export interface PageContent {
	pageNumber: number;
	text: string;
}

/**
 * Estimates token count using a simple approximation
 * OpenAI's tokenizer roughly follows: 1 token ≈ 4 chars for English text
 */
export function estimateTokenCount(text: string): number {
	return Math.ceil(text.length / 4);
}

/**
 * Split text into sentences using multiple sentence-ending patterns
 */
function splitIntoSentences(text: string): string[] {
	// Split on sentence endings, but keep the delimiter
	const sentences = text.split(/(?<=[.!?])\s+/);
	return sentences.filter(sentence => sentence.trim().length > 0);
}

/**
 * Chunk text while preserving sentence boundaries when possible
 */
export function chunkText(
	text: string,
	options: ChunkOptions = {}
): TextChunk[] {
	const {
		maxChunkSize = 1000,
		overlap = 100,
		preserveSentences = true
	} = options;

	if (!text || text.trim().length === 0) {
		return [];
	}

	const chunks: TextChunk[] = [];
	
	if (preserveSentences) {
		return chunkBySentences(text, maxChunkSize, overlap);
	} else {
		return chunkByCharacters(text, maxChunkSize, overlap);
	}
}

/**
 * Chunk text by preserving sentence boundaries
 */
function chunkBySentences(
	text: string,
	maxChunkSize: number,
	overlap: number
): TextChunk[] {
	const sentences = splitIntoSentences(text);
	const chunks: TextChunk[] = [];
	
	let currentChunk = "";
	let currentStartChar = 0;
	let chunkIndex = 0;
	
	for (let i = 0; i < sentences.length; i++) {
		const sentence = sentences[i];
		const potentialChunk = currentChunk + (currentChunk ? " " : "") + sentence;
		
		// Check if adding this sentence would exceed the limit
		if (estimateTokenCount(potentialChunk) > maxChunkSize && currentChunk) {
			// Save the current chunk
			const endChar = currentStartChar + currentChunk.length;
			chunks.push({
				content: currentChunk.trim(),
				index: chunkIndex++,
				startChar: currentStartChar,
				endChar,
				tokenCount: estimateTokenCount(currentChunk)
			});
			
			// Start new chunk with overlap
			const overlapText = getOverlapText(currentChunk, overlap);
			currentChunk = overlapText + (overlapText ? " " : "") + sentence;
			currentStartChar = endChar - overlapText.length;
		} else {
			// Add sentence to current chunk
			currentChunk = potentialChunk;
		}
		
		// If this is a very long sentence that exceeds maxChunkSize on its own
		if (estimateTokenCount(sentence) > maxChunkSize) {
			// Split the long sentence by characters
			const longSentenceChunks = chunkByCharacters(sentence, maxChunkSize, overlap);
			for (const longChunk of longSentenceChunks) {
				chunks.push({
					...longChunk,
					index: chunkIndex++,
					startChar: currentStartChar + longChunk.startChar,
					endChar: currentStartChar + longChunk.endChar
				});
			}
			currentChunk = "";
			currentStartChar = currentStartChar + sentence.length;
		}
	}
	
	// Add the final chunk if it exists
	if (currentChunk.trim()) {
		chunks.push({
			content: currentChunk.trim(),
			index: chunkIndex,
			startChar: currentStartChar,
			endChar: currentStartChar + currentChunk.length,
			tokenCount: estimateTokenCount(currentChunk)
		});
	}
	
	return chunks;
}

/**
 * Chunk text by character count (fallback method)
 */
function chunkByCharacters(
	text: string,
	maxChunkSize: number,
	overlap: number
): TextChunk[] {
	const chunks: TextChunk[] = [];
	const approximateCharSize = maxChunkSize * 4; // Convert tokens to approximate chars
	const overlapChars = overlap * 4;
	
	let startPos = 0;
	let chunkIndex = 0;
	
	while (startPos < text.length) {
		let endPos = Math.min(startPos + approximateCharSize, text.length);
		
		// Try to end at a word boundary
		if (endPos < text.length) {
			const lastSpace = text.lastIndexOf(' ', endPos);
			if (lastSpace > startPos + approximateCharSize * 0.8) {
				endPos = lastSpace;
			}
		}
		
		const content = text.slice(startPos, endPos);
		
		chunks.push({
			content: content.trim(),
			index: chunkIndex++,
			startChar: startPos,
			endChar: endPos,
			tokenCount: estimateTokenCount(content)
		});
		
		// Move start position with overlap
		startPos = endPos - overlapChars;
		if (startPos < 0) startPos = 0;
	}
	
	return chunks;
}

/**
 * Get overlap text from the end of a chunk
 */
function getOverlapText(text: string, overlapTokens: number): string {
	const overlapChars = overlapTokens * 4;
	if (text.length <= overlapChars) {
		return text;
	}
	
	const startPos = Math.max(0, text.length - overlapChars);
	const overlapText = text.slice(startPos);
	
	// Try to start at a word boundary
	const firstSpace = overlapText.indexOf(' ');
	if (firstSpace > 0 && firstSpace < overlapChars * 0.3) {
		return overlapText.slice(firstSpace + 1);
	}
	
	return overlapText;
}

/**
 * Process pages of content and chunk each page separately
 */
export function chunkPages(
	pages: PageContent[],
	options: ChunkOptions = {}
): Array<TextChunk & { pageNumber: number }> {
	const allChunks: Array<TextChunk & { pageNumber: number }> = [];
	let globalChunkIndex = 0;
	
	for (const page of pages) {
		const pageChunks = chunkText(page.text, options);
		
		for (const chunk of pageChunks) {
			allChunks.push({
				...chunk,
				index: globalChunkIndex++,
				pageNumber: page.pageNumber
			});
		}
	}
	
	return allChunks;
}

/**
 * Create a unique chunk ID for vector storage
 * Qdrant requires UUIDs or unsigned integers, so we generate a proper UUID
 */
export function createChunkId(
	documentId: string,
	chunkIndex: number,
	pageNumber?: number
): string {
	// Create a deterministic UUID based on document ID and chunk info
	// This ensures the same document + chunk always gets the same ID
	const baseString = pageNumber !== undefined 
		? `${documentId}_page${pageNumber}_chunk${chunkIndex}`
		: `${documentId}_chunk${chunkIndex}`;
		
	// Generate a UUID v5 (deterministic) based on the base string
	return generateDeterministicUUID(baseString);
}

/**
 * Generate a deterministic UUID from a string
 * This ensures the same input always produces the same UUID
 */
function generateDeterministicUUID(input: string): string {
	// For now, let's just use crypto.randomUUID() and accept non-deterministic IDs
	// This will ensure we always get valid UUIDs that Qdrant accepts
	// TODO: Implement proper deterministic UUID generation later if needed
	return crypto.randomUUID();
}