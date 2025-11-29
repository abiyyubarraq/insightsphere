export const AI_MODELS = [
  "HuggingFaceTB/SmolLM3-3B",
  "deepseek-ai/DeepSeek-V3.1",
  "deepseek-ai/DeepSeek-R1",
];

export const CONVERSATIONAL_MODELS = [
  "SmolLM3",
  "SmolLM2",
  "Llama-3",
  "Mistral-7B-Instruct",
  "Qwen",
];

export const EMBEDDING_MODELS = "Qwen/Qwen3-Embedding-8B";

// Embedding dimensions for each model
export const EMBEDDING_DIMENSIONS = {
  "Qwen/Qwen3-Embedding-0.6B": 1024,
  "Qwen/Qwen3-Embedding-4B": 2560,
  "Qwen/Qwen3-Embedding-8B": 4096,
  "BAAI/bge-small-en-v1.5": 384,
  "sentence-transformers/all-MiniLM-L6-v2": 384,
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
};

// Alternative embedding models (in order of preference)
export const EMBEDDING_MODEL_OPTIONS = [
  "Qwen/Qwen3-Embedding-0.6B", // Best balance of performance and efficiency
  "Qwen/Qwen3-Embedding-4B", // Higher performance, more resources
  "Qwen/Qwen3-Embedding-8B", // Highest performance
  "BAAI/bge-small-en-v1.5", // Fallback option
  "sentence-transformers/all-MiniLM-L6-v2", // Lightweight fallback
];
