/// <reference lib="deno.ns" />
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { assertEnv } from "./lib/config.ts";

// Checked before the route modules load, because the clients they import
// construct themselves at module scope and throw one at a time.
assertEnv();

const [
  { processDocument },
  { generateSummary },
  { searchDocuments },
  { getQuerySuggestions, queryProject },
  { sendChatMessage },
  { searchFiles },
  { deleteDocument },
  { deleteProject },
] = await Promise.all([
  import("./routes/documents/process.ts"),
  import("./routes/documents/generateSummary.ts"),
  import("./routes/search/query.ts"),
  import("./routes/projects/query.ts"),
  import("./routes/chat/send.ts"),
  import("./routes/searchFiles/search.ts"),
  import("./routes/documents/remove.ts"),
  import("./routes/projects/remove.ts"),
]);

const app = new Hono();

const allowedOrigins = (Deno.env.get("CORS_ORIGINS") ??
  "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use("*", cors({ origin: allowedOrigins, credentials: true }));
app.use("*", logger());

app.get("/health", (c) =>
  c.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  }));

const api = new Hono();

// Documents
api.post("/documents/process", processDocument);
api.post("/documents/generateSummary", generateSummary);
api.delete("/documents/:documentId", deleteDocument);

// Search
api.post("/search/query", searchDocuments);
api.post("/searchFiles", searchFiles);

// RAG
api.post("/projects/:projectId/query", queryProject);
api.get("/projects/:projectId/query/suggestions", getQuerySuggestions);
api.post("/projects/:projectId/chat", sendChatMessage);
api.delete("/projects/:projectId", deleteProject);

app.route("/v1", api);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  console.error("API Error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

const port = Number.parseInt(Deno.env.get("PORT") || "8000");

console.log(`🚀 InsightSphere API server starting on port ${port}`);

Deno.serve({ port }, app.fetch);
