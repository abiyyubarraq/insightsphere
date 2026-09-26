/// <reference lib="deno.ns" />
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { rateLimiter } from "hono-rate-limiter";
import { assertEnv } from "./lib/config.ts";
import type { AppEnv } from "./lib/auth.ts";

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
  { requireUser },
] = await Promise.all([
  import("./routes/documents/process.ts"),
  import("./routes/documents/generateSummary.ts"),
  import("./routes/search/query.ts"),
  import("./routes/projects/query.ts"),
  import("./routes/chat/send.ts"),
  import("./routes/searchFiles/search.ts"),
  import("./routes/documents/remove.ts"),
  import("./routes/projects/remove.ts"),
  import("./lib/auth.ts"),
]);

// Anything that was mid-flight when the server last stopped is unrecoverable,
// and the UI shows no action for a document stuck in "processing".
const { supabaseService } = await import("./lib/supabaseClient.ts");
const stalled = await supabaseService.failStalledDocuments();
if (stalled > 0) {
  console.log(`Reset ${stalled} document(s) left stuck in processing`);
}

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

const api = new Hono<AppEnv>();

// A guard against a runaway client, not the spend cap: MemoryStore resets on
// every deploy. The daily budget is the quota in Postgres.
const burst = rateLimiter<AppEnv>({
  windowMs: 60_000,
  limit: 20,
  keyGenerator: (c) => c.get("user").id,
  handler: (c) =>
    c.json({
      success: false,
      error: "Too many requests. Wait a minute and try again.",
    }, 429),
});

// Every route takes requireUser explicitly rather than api.use("*"), which
// would also catch unknown paths and turn their 404 into a 401.

// Documents
api.post("/documents/process", requireUser, burst, processDocument);
api.post("/documents/generateSummary", requireUser, burst, generateSummary);
api.delete("/documents/:documentId", requireUser, deleteDocument);

// Search
api.post("/search/query", requireUser, searchDocuments);
api.post("/searchFiles", requireUser, searchFiles);

// RAG
api.post("/projects/:projectId/query", requireUser, burst, queryProject);
api.get("/projects/:projectId/query/suggestions", requireUser, getQuerySuggestions);
api.post("/projects/:projectId/chat", requireUser, burst, sendChatMessage);
api.delete("/projects/:projectId", requireUser, deleteProject);

app.route("/v1", api);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  console.error("API Error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

const port = Number.parseInt(Deno.env.get("PORT") || "8000");

console.log(`🚀 InsightSphere API server starting on port ${port}`);

Deno.serve({ port }, app.fetch);
