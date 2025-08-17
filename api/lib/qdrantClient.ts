import { QdrantClient } from "qdrant-js";

export interface QdrantConfig {
	url: string;
	apiKey?: string;
	collectionName?: string; // Optional - will be generated dynamically
}

export interface DocumentChunk {
	id: string;
	content: string;
	embedding: number[];
	metadata: {
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

export interface SearchResult {
	id: string;
	content: string;
	score: number;
	metadata: DocumentChunk["metadata"];
}

export class QdrantService {
	private client: QdrantClient;
	private baseCollectionName: string;

	constructor(config: QdrantConfig) {
		this.client = new QdrantClient({
			url: config.url,
			apiKey: config.apiKey,
		});
		this.baseCollectionName = config.collectionName || "insightsphere";
	}

	/**
	 * Generate collection name based on user ID
	 * Format: "insightsphere_user_{userId}"
	 */
	private getCollectionName(userId: string): string {
		return `${this.baseCollectionName}_user_${userId}`;
	}

	/**
	 * Generate collection name for a specific user and project
	 * Format: "insightsphere_user_{userId}_project_{projectId}"
	 */
	private getProjectCollectionName(userId: string, projectId: string): string {
		return `${this.baseCollectionName}_user_${userId}_project_${projectId}`;
	}

	async ensureCollection(userId: string, dimension = 1536, projectId?: string): Promise<string> {
		try {
			const collectionName = projectId 
				? this.getProjectCollectionName(userId, projectId)
				: this.getCollectionName(userId);

			// Check if collection exists
			const collections = await this.client.getCollections();
			const existingCollection = collections.collections.find(
				(collection) => collection.name === collectionName,
			);

			if (existingCollection) {
				// Check if dimensions match
				try {
					const collectionInfo = await this.client.getCollection(collectionName);
					const currentDimension = collectionInfo.config?.params?.vectors?.size;
					
					if (currentDimension && currentDimension !== dimension) {
						console.log(`🔄 Collection dimension mismatch: expected ${dimension}, got ${currentDimension}`);
						console.log(`🗑️ Recreating collection with correct dimensions...`);
						
						// Delete and recreate with correct dimensions
						await this.client.deleteCollection(collectionName);
						await this.client.createCollection(collectionName, {
							vectors: {
								size: dimension,
								distance: "Cosine",
							},
						});
						console.log(`✅ Collection recreated: ${collectionName} with ${dimension} dimensions`);
					} else {
						console.log(`✅ Collection exists: ${collectionName} with correct ${dimension} dimensions`);
					}
				} catch (error) {
					console.warn("Could not verify collection dimensions, assuming it's correct:", error);
				}
			} else {
				console.log(`🆕 Creating new collection: ${collectionName} with ${dimension} dimensions`);
				await this.client.createCollection(collectionName, {
					vectors: {
						size: dimension,
						distance: "Cosine",
					},
				});
			}

			return collectionName;
		} catch (error) {
			console.error("Failed to ensure collection exists:", error);
			throw new Error(`Failed to initialize Qdrant collection for user: ${userId}`);
		}
	}

	async upsertChunks(chunks: DocumentChunk[], options: { useProjectCollection?: boolean } = {}): Promise<void> {
		try {
			if (chunks.length === 0) {
				throw new Error("No chunks provided");
			}

			// Get user and project info from first chunk
			const firstChunk = chunks[0];
			const { userId, projectId } = firstChunk.metadata;

			// Detect embedding dimensions from the first chunk
			const embeddingDimension = firstChunk.embedding.length;
			console.log(`🔗 Ensuring Qdrant collection with ${embeddingDimension} dimensions for user: ${userId}`);
			
			// Determine collection strategy
			const collectionName = await this.ensureCollection(
				userId, 
				embeddingDimension, 
				options.useProjectCollection ? projectId : undefined
			);

			const points = chunks.map((chunk) => ({
				id: chunk.id,
				vector: chunk.embedding,
				payload: {
					content: chunk.content,
					...chunk.metadata,
				},
			}));

			await this.client.upsert(collectionName, {
				wait: true,
				points,
			});

			console.log(`Successfully upserted ${chunks.length} chunks to collection: ${collectionName}`);
		} catch (error) {
			console.error("Failed to upsert chunks:", error);
			throw new Error(`Failed to store chunks in Qdrant: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	}

	async searchSimilar(
		queryVector: number[],
		options: {
			limit?: number;
			threshold?: number;
			projectId?: string;
			documentId?: string;
			userId: string; // Required - we need to know which collection to search
			useProjectCollection?: boolean;
		},
	): Promise<SearchResult[]> {
		try {
			const { limit = 10, threshold = 0.7, projectId, documentId, userId, useProjectCollection } = options;

			// Determine which collection to search
			const collectionName = useProjectCollection && projectId
				? this.getProjectCollectionName(userId, projectId)
				: this.getCollectionName(userId);

			// Build filter (less filtering needed since collection is already user-specific)
			const filter: { must?: Array<{ key: string; match: { value: string } }> } = {};
			if (projectId && !useProjectCollection) {
				// Only filter by projectId if we're using user collection (not project-specific collection)
				filter.must = filter.must || [];
				filter.must.push({
					key: "projectId",
					match: { value: projectId },
				});
			}
			if (documentId) {
				filter.must = filter.must || [];
				filter.must.push({
					key: "documentId",
					match: { value: documentId },
				});
			}

			const searchResult = await this.client.search(collectionName, {
				vector: queryVector,
				limit,
				score_threshold: threshold,
				filter: Object.keys(filter).length > 0 ? filter : undefined,
			});

			return searchResult.map((result) => ({
				id: String(result.id),
				content: result.payload?.content as string,
				score: result.score,
				metadata: {
					documentId: result.payload?.documentId as string,
					projectId: result.payload?.projectId as string,
					userId: result.payload?.userId as string,
					pageNumber: result.payload?.pageNumber as number | undefined,
					chunkIndex: result.payload?.chunkIndex as number,
					fileName: result.payload?.fileName as string,
					fileType: result.payload?.fileType as string,
					createdAt: result.payload?.createdAt as string,
				},
			}));
		} catch (error) {
			console.error("Failed to search similar vectors:", error);
			throw new Error(`Failed to search vectors: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	}

	async deleteByDocumentId(documentId: string, userId: string, projectId?: string): Promise<void> {
		try {
			// Try both user and project collections
			const collections = [this.getCollectionName(userId)];
			if (projectId) {
				collections.push(this.getProjectCollectionName(userId, projectId));
			}

			for (const collectionName of collections) {
				try {
					await this.client.delete(collectionName, {
						wait: true,
						filter: {
							must: [
								{
									key: "documentId",
									match: { value: documentId },
								},
							],
						},
					});
					console.log(`Successfully deleted chunks for document: ${documentId} from ${collectionName}`);
				} catch (error) {
					// Collection might not exist, continue with next one
					console.warn(`Could not delete from collection ${collectionName}:`, error);
				}
			}
		} catch (error) {
			console.error("Failed to delete document chunks:", error);
			throw new Error(`Failed to delete document chunks: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	}

	async listUserCollections(userId: string): Promise<string[]> {
		try {
			const collections = await this.client.getCollections();
			const userCollections = collections.collections
				.map(c => c.name)
				.filter(name => name.startsWith(`${this.baseCollectionName}_user_${userId}`));
			
			return userCollections;
		} catch (error) {
			console.error("Failed to list user collections:", error);
			return [];
		}
	}

	async deleteUserData(userId: string): Promise<void> {
		try {
			const userCollections = await this.listUserCollections(userId);
			
			for (const collectionName of userCollections) {
				try {
					await this.client.deleteCollection(collectionName);
					console.log(`Deleted collection: ${collectionName}`);
				} catch (error) {
					console.warn(`Could not delete collection ${collectionName}:`, error);
				}
			}
		} catch (error) {
			console.error("Failed to delete user data:", error);
			throw new Error(`Failed to delete user data: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	}

	async getCollectionInfo(userId: string, projectId?: string): Promise<unknown> {
		try {
			const collectionName = projectId 
				? this.getProjectCollectionName(userId, projectId)
				: this.getCollectionName(userId);
			return await this.client.getCollection(collectionName);
		} catch (error) {
			console.error("Failed to get collection info:", error);
			throw error;
		}
	}
}

// Export configured instance
export const qdrantService = new QdrantService({
	url: Deno.env.get("QDRANT_URL") || "http://localhost:6333",
	apiKey: Deno.env.get("QDRANT_API_KEY"),
	collectionName: Deno.env.get("QDRANT_COLLECTION") || "insightsphere",
});