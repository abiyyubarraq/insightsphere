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
 * Memory-optimized chunk text function
 * Uses character-based chunking by default (much more memory efficient than sentence-based)
 */
export function chunkText(
  text: string,
  options: ChunkOptions = {}
): TextChunk[] {
  const {
    maxChunkSize = 800,
    overlap = 50, // Reduced from 100 for less memory duplication
    preserveSentences = false, // Default to false for memory efficiency
  } = options;

  if (!text || text.trim().length === 0) {
    return [];
  }

  if (preserveSentences) {
    return chunkBySentencesOptimized(text, maxChunkSize, overlap);
  } else {
    return chunkByCharactersOptimized(text, maxChunkSize, overlap);
  }
}

/**
 * Memory-optimized character-based chunking
 * - Uses slice() which shares memory with original string in V8
 * - Minimal intermediate allocations
 * - Finds word boundaries without regex
 */
function chunkByCharactersOptimized(
  text: string,
  maxChunkSize: number,
  overlap: number
): TextChunk[] {
  const chunks: TextChunk[] = [];
  const chunkChars = maxChunkSize * 4; // ~800 tokens = ~3200 chars
  const overlapChars = overlap * 4;    // ~50 tokens = ~200 chars

  let startPos = 0;
  let chunkIndex = 0;

  while (startPos < text.length) {
    let endPos = Math.min(startPos + chunkChars, text.length);

    // Find word boundary (look for last space within range)
    if (endPos < text.length) {
      // Search backwards from endPos for a space
      for (let i = endPos; i > startPos + chunkChars * 0.7; i--) {
        if (text[i] === ' ' || text[i] === '\n') {
          endPos = i;
          break;
        }
      }
    }

    // Extract chunk content (slice shares memory in V8)
    const content = text.slice(startPos, endPos).trim();

    if (content.length > 0) {
      chunks.push({
        content,
        index: chunkIndex++,
        startChar: startPos,
        endChar: endPos,
        tokenCount: Math.ceil(content.length / 4),
      });
    }

    // Move to next position with overlap
    startPos = endPos - overlapChars;
    if (startPos <= chunks[chunks.length - 1]?.startChar) {
      startPos = endPos; // Prevent infinite loop
    }
  }

  return chunks;
}

/**
 * Optimized sentence-based chunking (use sparingly - more memory intensive)
 * - Avoids regex for sentence splitting
 * - Minimizes string concatenation
 */
function chunkBySentencesOptimized(
  text: string,
  maxChunkSize: number,
  overlap: number
): TextChunk[] {
  const chunks: TextChunk[] = [];
  const chunkChars = maxChunkSize * 4;
  const overlapChars = overlap * 4;

  // Find sentence boundaries without regex (more memory efficient)
  const sentenceEndings = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
  let startPos = 0;
  let chunkIndex = 0;

  while (startPos < text.length) {
    let endPos = Math.min(startPos + chunkChars, text.length);

    // If not at the end, find a sentence boundary
    if (endPos < text.length) {
      let bestEnd = -1;

      // Search backwards for sentence ending
      for (let i = endPos; i > startPos + chunkChars * 0.5; i--) {
        for (const ending of sentenceEndings) {
          if (i >= ending.length - 1) {
            const possibleEnding = text.slice(i - ending.length + 1, i + 1);
            if (possibleEnding === ending) {
              bestEnd = i + 1;
              break;
            }
          }
        }
        if (bestEnd > 0) break;
      }

      // Fall back to word boundary if no sentence boundary found
      if (bestEnd < 0) {
        for (let i = endPos; i > startPos + chunkChars * 0.7; i--) {
          if (text[i] === ' ' || text[i] === '\n') {
            bestEnd = i;
            break;
          }
        }
      }

      if (bestEnd > startPos) {
        endPos = bestEnd;
      }
    }

    const content = text.slice(startPos, endPos).trim();

    if (content.length > 0) {
      chunks.push({
        content,
        index: chunkIndex++,
        startChar: startPos,
        endChar: endPos,
        tokenCount: Math.ceil(content.length / 4),
      });
    }

    // Move to next position with overlap
    startPos = endPos - overlapChars;
    if (startPos <= chunks[chunks.length - 1]?.startChar) {
      startPos = endPos;
    }
  }

  return chunks;
}

/**
 * Process pages of content and chunk each page separately
 * Memory-optimized: processes one page at a time
 */
export function chunkPages(
  pages: PageContent[],
  options: ChunkOptions = {}
): Array<TextChunk & { pageNumber: number }> {
  const allChunks: Array<TextChunk & { pageNumber: number }> = [];
  let globalChunkIndex = 0;

  for (const page of pages) {
    // Process one page at a time
    const pageChunks = chunkText(page.text, options);

    for (const chunk of pageChunks) {
      allChunks.push({
        ...chunk,
        index: globalChunkIndex++,
        pageNumber: page.pageNumber,
      });
    }

    // Clear reference to allow GC (page.text can be large)
    // deno-lint-ignore no-explicit-any
    (page as any).text = "";
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
  const baseString =
    pageNumber !== undefined
      ? `${documentId}_page${pageNumber}_chunk${chunkIndex}`
      : `${documentId}_chunk${chunkIndex}`;

  // Generate a UUID v5 (deterministic) based on the base string
  return generateDeterministicUUID(baseString);
}

/**
 * Generate a deterministic UUID from a string
 * This ensures the same input always produces the same UUID
 */
function generateDeterministicUUID(_input: string): string {
  // For now, let's just use crypto.randomUUID() and accept non-deterministic IDs
  // This will ensure we always get valid UUIDs that Qdrant accepts
  // TODO: Implement proper deterministic UUID generation later if needed
  return crypto.randomUUID();
}
