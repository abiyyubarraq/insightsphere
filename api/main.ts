/// <reference lib="deno.ns" />
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { processDocument } from "./routes/documents/process.ts";
import { searchDocuments } from "./routes/search/query.ts";
import {
	testDashboard,
	getTestConfig,
	updateTestConfig,
	configForm,
	testApiHealth,
	testQdrant,
	testOpenAI,
	testDocumentProcess,
	testDocumentProcessHttp,
	testListDocuments,
	testVectorStats,
	testVectorSearch,
	testProjectSearch,
} from "./routes/test/index.ts";

const app = new Hono();

// Middleware
app.use(
	"*",
	cors({
		origin: ["http://localhost:5173", "https://insightsphere.app"],
		credentials: true,
	}),
);
app.use("*", logger());

// Health check
app.get("/health", (c) => {
	return c.json({
		status: "healthy",
		timestamp: new Date().toISOString(),
		version: "1.0.0",
	});
});

// API routes
const api = new Hono();

// Chat endpoint with streaming
api.post("/chat/stream", async (c) => {
	const { messages: _messages } = await c.req.json();

	// Set headers for SSE
	c.header("Content-Type", "text/event-stream");
	c.header("Cache-Control", "no-cache");
	c.header("Connection", "keep-alive");

	// Create a ReadableStream for streaming
	const stream = new ReadableStream({
		start(controller) {
			// Mock streaming response
			const words = ["Hello", "from", "InsightSphere", "AI", "assistant!"];

			let index = 0;
			const interval = setInterval(() => {
				if (index < words.length) {
					const data = `data: ${JSON.stringify({ content: `${words[index]} ` })}\n\n`;
					controller.enqueue(new TextEncoder().encode(data));
					index++;
				} else {
					controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
					controller.close();
					clearInterval(interval);
				}
			}, 100);
		},
	});

	return new Response(stream);
});

// Document processing endpoint
api.post("/documents/process", processDocument);

// Search endpoint (RAG)
api.post("/search/query", searchDocuments);

// Test endpoints for browser-based testing
api.get("/test/dashboard", testDashboard);
api.get("/test/config", getTestConfig);
api.post("/test/config", updateTestConfig);
api.get("/test/config/form", configForm);
api.get("/test/health", testApiHealth);
api.get("/test/qdrant", testQdrant);
api.get("/test/openai", testOpenAI);
api.get("/test/process", testDocumentProcess);
api.get("/test/process-http", testDocumentProcessHttp);
api.get("/test/documents", testListDocuments);
api.get("/test/vectors", testVectorStats);
api.get("/test/search", testVectorSearch);
api.get("/test/search-project", testProjectSearch);

// Document analysis endpoint
api.post("/documents/analyze", async (c) => {
	const { documentId, query } = await c.req.json();

	// Mock response
	return c.json({
		documentId,
		query,
		analysis: {
			summary: "Document analysis complete",
			keyPoints: ["Point 1", "Point 2", "Point 3"],
			confidence: 0.95,
			timestamp: new Date().toISOString(),
		},
	});
});

// Mount API routes
app.route("/v1", api);

// 404 handler
app.notFound((c) => {
	return c.json({ error: "Not found" }, 404);
});

// Error handler
app.onError((err, c) => {
	console.error("API Error:", err);
	return c.json({ error: "Internal server error" }, 500);
});

const port = Number.parseInt(Deno.env.get("PORT") || "8000");

console.log(`🚀 InsightSphere API server starting on port ${port}`);

Deno.serve({ port }, app.fetch);
