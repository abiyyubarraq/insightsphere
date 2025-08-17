/**
 * Free embedding alternatives for development
 * Uses various free APIs and models
 */

export interface FreeEmbeddingResponse {
	embedding: number[];
	usage: {
		prompt_tokens: number;
		total_tokens: number;
	};
	model: string;
}

export class FreeEmbeddingClient {
	
	/**
	 * Generate embeddings using Hugging Face Inference API (free tier)
	 */
	async generateHuggingFaceEmbedding(text: string): Promise<FreeEmbeddingResponse> {
		try {
			const hfToken = Deno.env.get("HUGGINGFACE_API_KEY");
			if (!hfToken) {
				throw new Error("HUGGINGFACE_API_KEY not set. Get free API key from https://huggingface.co/settings/tokens");
			}

			console.log(`🤗 Calling Hugging Face API for text: ${text.substring(0, 50)}...`);
			console.log(`🔑 Using token: ${hfToken.substring(0, 8)}...`);

			const response = await fetch(
				"https://api-inference.huggingface.co/models/BAAI/bge-small-en-v1.5",
				{
					method: "POST",
					headers: {
						"Authorization": `Bearer ${hfToken}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						inputs: text,
						parameters: {
							task: "feature-extraction"
						},
						options: { 
							wait_for_model: true,
							use_cache: false
						}
					}),
				}
			);

			if (!response.ok) {
				const error = await response.text();
				console.error(`🚫 Hugging Face API Error:`, {
					status: response.status,
					statusText: response.statusText,
					error: error,
					url: "https://api-inference.huggingface.co/models/BAAI/bge-small-en-v1.5"
				});
				throw new Error(`Hugging Face API error: ${response.status} ${response.statusText} - ${error}`);
			}

			const result = await response.json();
			
			// Handle different response formats
			let embedding;
			if (Array.isArray(result)) {
				// Check if it's a direct embedding array (numbers) or array of embeddings
				if (typeof result[0] === 'number') {
					// Direct embedding array
					embedding = result;
				} else {
					// Array of embeddings, take the first one
					embedding = result[0];
				}
			} else if (result && Array.isArray(result.embeddings)) {
				// Response has embeddings property
				embedding = result.embeddings[0];
			} else if (result && Array.isArray(result.data)) {
				// OpenAI-like format
				embedding = result.data[0].embedding;
			} else {
				// Direct embedding
				embedding = result;
			}
			
			if (!embedding || !Array.isArray(embedding) || typeof embedding[0] !== 'number') {
				throw new Error(`Invalid embedding response format: expected array of numbers, got: ${JSON.stringify(result).substring(0, 200)}...`);
			}
			
			console.log(`✅ HuggingFace embedding generated: ${embedding.length} dimensions`);
			
			return {
				embedding: embedding,
				usage: {
					prompt_tokens: Math.ceil(text.length / 4),
					total_tokens: Math.ceil(text.length / 4)
				},
				model: "BAAI/bge-small-en-v1.5"
			};

		} catch (error) {
			console.error("Hugging Face embedding failed:", error);
			throw error;
		}
	}

	/**
	 * Generate simple hash-based embeddings (fallback for testing)
	 * Not suitable for production but works for development
	 */
	async generateHashEmbedding(text: string): Promise<FreeEmbeddingResponse> {
		try {
			// Create a simple hash-based embedding (384 dimensions like MiniLM)
			const embedding = new Array(384).fill(0);
			
			// Simple hash function to create consistent embeddings
			let hash = 0;
			for (let i = 0; i < text.length; i++) {
				const char = text.charCodeAt(i);
				hash = ((hash << 5) - hash) + char;
				hash = hash & hash; // Convert to 32-bit integer
			}

			// Fill embedding with deterministic values based on text
			for (let i = 0; i < 384; i++) {
				const seed = hash + i;
				embedding[i] = (Math.sin(seed) + 1) / 2; // Normalize to 0-1
			}

			// Add some text-based features
			const words = text.toLowerCase().split(/\s+/);
			const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
			const uniqueWords = new Set(words).size;
			
			// Incorporate text features into embedding
			embedding[0] = Math.min(avgWordLength / 10, 1);
			embedding[1] = Math.min(uniqueWords / 100, 1);
			embedding[2] = Math.min(text.length / 1000, 1);

			return {
				embedding,
				usage: {
					prompt_tokens: Math.ceil(text.length / 4),
					total_tokens: Math.ceil(text.length / 4)
				},
				model: "hash-embedding-dev"
			};

		} catch (error) {
			console.error("Hash embedding failed:", error);
			throw error;
		}
	}

	/**
	 * Generate batch embeddings using the best available free method
	 */
	async generateBatchEmbeddings(
		texts: string[],
		model = "auto"
	): Promise<FreeEmbeddingResponse[]> {
		try {
			console.log(`🆓 Generating ${texts.length} free embeddings using model: ${model}`);
			
			const embeddings: FreeEmbeddingResponse[] = [];
			
			for (let i = 0; i < texts.length; i++) {
				const text = texts[i];
				console.log(`📝 Processing chunk ${i + 1}/${texts.length} (${text.length} chars)`);
				
				let embedding: FreeEmbeddingResponse;
				
				try {
					if (model === "huggingface" || (model === "auto" && Deno.env.get("HUGGINGFACE_API_KEY"))) {
						embedding = await this.generateHuggingFaceEmbedding(text);
						console.log(`✅ HuggingFace embedding generated for chunk ${i + 1}`);
					} else {
						embedding = await this.generateHashEmbedding(text);
						console.log(`✅ Hash embedding generated for chunk ${i + 1}`);
					}
					
					embeddings.push(embedding);
					
					// Rate limiting for free APIs
					if (model === "huggingface" || (model === "auto" && Deno.env.get("HUGGINGFACE_API_KEY"))) {
						await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
					}
					
				} catch (error) {
					console.warn(`⚠️ Failed to generate embedding for chunk ${i + 1}, falling back to hash:`, error);
					embedding = await this.generateHashEmbedding(text);
					embeddings.push(embedding);
				}
			}
			
			console.log(`🎉 Generated ${embeddings.length} embeddings successfully`);
			return embeddings;

		} catch (error) {
			console.error("Batch embedding generation failed:", error);
			throw error;
		}
	}
}

// Export singleton instance
export const freeEmbeddingClient = new FreeEmbeddingClient();
