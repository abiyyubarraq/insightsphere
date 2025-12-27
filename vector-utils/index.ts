import { QdrantClient } from "@qdrant/js-client-rest";
import type { VectorSearchResult } from "../shared/types/index.ts";

export interface VectorConfig {
  url: string;
  apiKey?: string;
  collectionName: string;
}

export interface EmbeddingPoint {
  id: string;
  vector: number[];
  payload: {
    content: string;
    documentId: string;
    projectId: string;
    userId: string;
    pageNumber?: number;
    chunkIndex: number;
    fileName: string;
    fileType: string;
    createdAt: string;
  };
}

export class VectorStore {
  private client: QdrantClient;
  private collectionName: string;

  constructor(config: VectorConfig) {
    this.client = new QdrantClient({
      url: config.url,
      apiKey: config.apiKey,
    });
    this.collectionName = config.collectionName;
  }

  async initializeCollection(dimension = 1536): Promise<void> {
    try {
      // Check if collection exists
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(
        (collection: { name: string }) =>
          collection.name === this.collectionName
      );

      if (!exists) {
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: dimension,
            distance: "Cosine",
          },
        });
      }
    } catch (error) {
      console.error("Failed to initialize collection:", error);
      throw error;
    }
  }

  async addPoints(points: EmbeddingPoint[]): Promise<void> {
    try {
      const qdrantPoints = points.map((point) => ({
        id: point.id,
        vector: point.vector,
        payload: point.payload,
      }));

      await this.client.upsert(this.collectionName, {
        wait: true,
        points: qdrantPoints,
      });
    } catch (error) {
      console.error("Failed to add points:", error);
      throw error;
    }
  }

  async searchSimilar(
    queryVector: number[],
    options: {
      limit?: number;
      threshold?: number;
      filter?: Record<string, unknown>;
    } = {}
  ): Promise<VectorSearchResult[]> {
    try {
      const { limit = 10, threshold = 0.7, filter } = options;

      const searchResult = await this.client.search(this.collectionName, {
        vector: queryVector,
        limit,
        score_threshold: threshold,
        filter,
      });

      return searchResult.map((result: any) => ({
        id: String(result.id),
        content: result.payload?.content as string,
        similarity: result.score,
        metadata: {
          documentId: result.payload?.documentId as string,
          projectId: result.payload?.projectId as string,
          userId: result.payload?.userId as string,
          pageNumber: result.payload?.pageNumber as number | undefined,
          chunkIndex: result.payload?.chunkIndex as number,
          fileName: result.payload?.fileName as string,
          fileType: result.payload?.fileType as string,
        },
      }));
    } catch (error) {
      console.error("Failed to search similar vectors:", error);
      throw error;
    }
  }

  async deletePoints(ids: string[]): Promise<void> {
    try {
      await this.client.delete(this.collectionName, {
        wait: true,
        points: ids,
      });
    } catch (error) {
      console.error("Failed to delete points:", error);
      throw error;
    }
  }

  async deleteByFilter(filter: Record<string, unknown>): Promise<void> {
    try {
      await this.client.delete(this.collectionName, {
        wait: true,
        filter,
      });
    } catch (error) {
      console.error("Failed to delete by filter:", error);
      throw error;
    }
  }

  async getCollectionInfo(): Promise<unknown> {
    try {
      return await this.client.getCollection(this.collectionName);
    } catch (error) {
      console.error("Failed to get collection info:", error);
      throw error;
    }
  }
}

// Utility functions for text processing
export const chunkText = (text: string, maxChunkSize = 1000): string[] => {
  const sentences = text.split(/[.!?]+/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    if (currentChunk.length + trimmedSentence.length + 1 <= maxChunkSize) {
      currentChunk += (currentChunk ? ". " : "") + trimmedSentence;
    } else {
      if (currentChunk) {
        chunks.push(`${currentChunk}.`);
      }
      currentChunk = trimmedSentence;
    }
  }

  if (currentChunk) {
    chunks.push(`${currentChunk}.`);
  }

  return chunks;
};

export const createEmbeddingId = (
  documentId: string,
  chunkIndex: number
): string => {
  return `${documentId}_chunk_${chunkIndex}`;
};

export const generateEmbeddingPayload = (
  content: string,
  documentId: string,
  projectId: string,
  userId: string,
  chunkIndex: number,
  fileName: string,
  fileType: string,
  pageNumber?: number
): EmbeddingPoint["payload"] => {
  return {
    content,
    documentId,
    projectId,
    userId,
    pageNumber,
    chunkIndex,
    fileName,
    fileType,
    createdAt: new Date().toISOString(),
  };
};
