// API endpoints
export const API_ENDPOINTS = {
	HEALTH: "/health",
	CHAT_STREAM: "/v1/chat/stream",
	DOCUMENTS_ANALYZE: "/v1/documents/analyze",
	DOCUMENTS_UPLOAD: "/v1/documents/upload",
	DOCUMENTS_LIST: "/v1/documents",
	PARSE_PDF: "/parse/pdf",
	PARSE_DOCX: "/parse/docx",
} as const;

// File constraints
export const FILE_CONSTRAINTS = {
	MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
	ALLOWED_TYPES: ["pdf", "docx"],
	MAX_PAGES: 1000,
} as const;

// Model configurations
export const MODEL_CONFIGS = {
	"gpt-4o": {
		maxTokens: 128000,
		contextWindow: 128000,
		costPer1kTokens: 0.005,
	},
	"claude-3-sonnet": {
		maxTokens: 200000,
		contextWindow: 200000,
		costPer1kTokens: 0.003,
	},
} as const;

// Subscription limits
export const SUBSCRIPTION_LIMITS = {
	free: {
		maxDocuments: 5,
		maxFileSizeMB: 10,
		maxQueriesPerMonth: 100,
	},
	pro: {
		maxDocuments: 100,
		maxFileSizeMB: 50,
		maxQueriesPerMonth: 1000,
	},
	enterprise: {
		maxDocuments: -1, // unlimited
		maxFileSizeMB: 100,
		maxQueriesPerMonth: -1, // unlimited
	},
} as const;

// Error messages
export const ERROR_MESSAGES = {
	FILE_TOO_LARGE: "File size exceeds maximum limit",
	INVALID_FILE_TYPE: "File type not supported",
	PARSING_FAILED: "Failed to parse document",
	UNAUTHORIZED: "Authentication required",
	RATE_LIMITED: "Rate limit exceeded",
	INTERNAL_ERROR: "Internal server error",
} as const;

// Status codes
export const STATUS_CODES = {
	OK: 200,
	CREATED: 201,
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	RATE_LIMITED: 429,
	INTERNAL_ERROR: 500,
} as const;

// Vector search settings
export const VECTOR_SEARCH = {
	DEFAULT_LIMIT: 10,
	MAX_LIMIT: 100,
	DEFAULT_THRESHOLD: 0.7,
	EMBEDDING_DIMENSION: 1536,
} as const;

// Time constants
export const TIME_CONSTANTS = {
	MINUTE: 60 * 1000,
	HOUR: 60 * 60 * 1000,
	DAY: 24 * 60 * 60 * 1000,
	WEEK: 7 * 24 * 60 * 60 * 1000,
	MONTH: 30 * 24 * 60 * 60 * 1000,
} as const;
