import OpenAI from "openai";

export interface EmbeddingRequest {
	text: string;
	model?: string;
}

export interface EmbeddingResponse {
	embedding: number[];
	usage: {
		prompt_tokens: number;
		total_tokens: number;
	};
}

export class OpenAIClient {
	private client: OpenAI;

	constructor(apiKey?: string) {
		if (!apiKey) {
			apiKey = Deno.env.get("OPENAI_API_KEY");
		}
		if (!apiKey) {
			throw new Error("OpenAI API key is required");
		}

		this.client = new OpenAI({
			apiKey,
		});
	}

	async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
		try {
			const response = await this.client.embeddings.create({
				model: request.model || "text-embedding-3-small",
				input: request.text,
				encoding_format: "float",
			});

			if (!response.data || response.data.length === 0) {
				throw new Error("No embedding data returned from OpenAI");
			}

			return {
				embedding: response.data[0].embedding,
				usage: {
					prompt_tokens: response.usage?.prompt_tokens || 0,
					total_tokens: response.usage?.total_tokens || 0,
				},
			};
		} catch (error) {
			console.error("OpenAI embedding generation failed:", error);
			throw new Error(
				`Failed to generate embedding: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	async generateBatchEmbeddings(
		texts: string[],
		model = "text-embedding-3-small",
	): Promise<EmbeddingResponse[]> {
		try {
			const response = await this.client.embeddings.create({
				model,
				input: texts,
				encoding_format: "float",
			});

			if (!response.data || response.data.length === 0) {
				throw new Error("No embedding data returned from OpenAI");
			}

			return response.data.map((item) => ({
				embedding: item.embedding,
				usage: {
					prompt_tokens: response.usage?.prompt_tokens || 0,
					total_tokens: response.usage?.total_tokens || 0,
				},
			}));
		} catch (error) {
			console.error("OpenAI batch embedding generation failed:", error);
			throw new Error(
				`Failed to generate batch embeddings: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}
}

// Export singleton instance
export const openaiClient = new OpenAIClient();