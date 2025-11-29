# Deno Conventions & API Patterns

**Comprehensive guide to Deno development, Hono framework patterns, and API best practices for InsightSphere.**

---

## Table of Contents

1. [Deno Basics](#deno-basics)
2. [Module System](#module-system)
3. [Permissions Model](#permissions-model)
4. [File System Operations](#file-system-operations)
5. [Environment Variables](#environment-variables)
6. [HTTP Server with Hono](#http-server-with-hono)
7. [Middleware Patterns](#middleware-patterns)
8. [Error Handling](#error-handling)
9. [Testing](#testing)
10. [Deployment](#deployment)

---

## Deno Basics

### Why Deno for APIs?

| Feature | Benefit |
|---------|---------|
| **Built-in TypeScript** | No compilation step required |
| **Secure by default** | Explicit permissions for file/network/env access |
| **ES modules** | Modern import/export syntax |
| **Web APIs** | Fetch, WebSocket, Web Crypto built-in |
| **No package.json** | Dependencies in code, lockfile for versions |
| **Fast startup** | Optimized V8 runtime |

### Installation & Version

```bash
# Install Deno
curl -fsSL https://deno.land/install.sh | sh

# Check version
deno --version

# Upgrade Deno
deno upgrade

# Target version: Deno 2.5+
```

### Running Deno Scripts

```bash
# Development (with watch mode)
deno task dev

# Production
deno task start

# With explicit permissions
deno run --allow-net --allow-env --allow-read main.ts
```

---

## Module System

### Import from npm

**Use `npm:` specifier** for npm packages:

```typescript
// ✅ Good - explicit npm imports
import { Hono } from "npm:hono@^4.0.0";
import OpenAI from "npm:openai@^4.0.0";
import { createClient } from "npm:@supabase/supabase-js@^2.38.0";

// ❌ Bad - don't use bare specifiers without deno.json config
import { Hono } from "hono";  // Error: Module not found
```

### Import from URLs

```typescript
// Deno standard library
import { delay } from "https://deno.land/std@0.210.0/async/delay.ts";

// Third-party modules
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
```

### deno.jsonc Configuration

**Configure import maps** for cleaner imports:

```json
{
  "compilerOptions": {
    "strict": true,
    "lib": ["dom", "dom.iterable", "es2022"],
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx"
  },
  "imports": {
    "hono": "npm:hono@^4.0.0",
    "hono/cors": "npm:hono@^4.0.0/cors",
    "hono/logger": "npm:hono@^4.0.0/logger",
    "openai": "npm:openai@^4.0.0",
    "qdrant-js": "npm:@qdrant/js-client-rest@^1.8.0",
    "@supabase/supabase-js": "npm:@supabase/supabase-js@^2.38.0"
  },
  "tasks": {
    "dev": "deno run --allow-net --allow-env --allow-read --allow-write --watch main.ts",
    "start": "deno run --allow-net --allow-env --allow-read --allow-write main.ts"
  }
}
```

**Usage with import map**:

```typescript
// Now you can use clean imports
import { Hono } from "hono";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
```

### Local Modules

```typescript
// Relative imports
import { processDocument } from "./lib/processor.ts";
import { qdrantClient } from "../vector/qdrant.ts";

// ❌ Bad - don't omit .ts extension
import { processDocument } from "./lib/processor";
```

---

## Permissions Model

### Permission Flags

Deno requires **explicit permissions** for security:

| Flag | Permission | Example |
|------|------------|---------|
| `--allow-net` | Network access | HTTP requests, WebSockets |
| `--allow-read` | File system read | Read files, list directories |
| `--allow-write` | File system write | Write files, create directories |
| `--allow-env` | Environment variables | Read `Deno.env.get()` |
| `--allow-run` | Run subprocesses | Execute shell commands |
| `-A` | All permissions | **Avoid in production!** |

### Granular Permissions

```bash
# Allow network access to specific domains only
deno run --allow-net=api.openai.com,*.supabase.co main.ts

# Allow reading specific directories only
deno run --allow-read=/tmp,./data main.ts

# Allow specific environment variables only
deno run --allow-env=OPENAI_API_KEY,SUPABASE_URL main.ts
```

### Permission Checks in Code

```typescript
// Check if permission is granted
const netPermission = await Deno.permissions.query({ name: "net" });

if (netPermission.state === "granted") {
  console.log("Network access granted");
}

// Request permission at runtime (interactive prompt)
const readPermission = await Deno.permissions.request({
  name: "read",
  path: "./data"
});

if (readPermission.state === "granted") {
  const data = await Deno.readTextFile("./data/file.txt");
}
```

---

## File System Operations

### Reading Files

```typescript
// Read text file
const text = await Deno.readTextFile("./config.json");
const config = JSON.parse(text);

// Read binary file
const binary = await Deno.readFile("./document.pdf");
console.log(binary);  // Uint8Array

// Read directory
for await (const entry of Deno.readDir("./uploads")) {
  console.log(entry.name, entry.isFile, entry.isDirectory);
}
```

### Writing Files

```typescript
// Write text file
await Deno.writeTextFile("./output.txt", "Hello, Deno!");

// Write binary file
const data = new Uint8Array([1, 2, 3, 4]);
await Deno.writeFile("./output.bin", data);

// Append to file
await Deno.writeTextFile("./log.txt", "New log entry\n", { append: true });
```

### File Operations

```typescript
// Copy file
await Deno.copyFile("./source.txt", "./destination.txt");

// Rename/move file
await Deno.rename("./old-name.txt", "./new-name.txt");

// Delete file
await Deno.remove("./temp-file.txt");

// Delete directory (recursive)
await Deno.remove("./temp-dir", { recursive: true });

// Create directory
await Deno.mkdir("./uploads", { recursive: true });

// Check if file exists
try {
  await Deno.stat("./file.txt");
  console.log("File exists");
} catch (error) {
  if (error instanceof Deno.errors.NotFound) {
    console.log("File does not exist");
  }
}
```

### Temporary Files

```typescript
// Create temp file
async function createTempFile(data: Uint8Array, fileName: string): Promise<string> {
  const timestamp = Date.now();
  const randomId = crypto.randomUUID();
  const tempDir = `/tmp/insightsphere_${timestamp}_${randomId}`;

  await Deno.mkdir(tempDir, { recursive: true });

  const tempPath = `${tempDir}/${fileName}`;
  await Deno.writeFile(tempPath, data);

  return tempPath;
}

// Cleanup temp file
async function cleanupTempFile(filePath: string): Promise<void> {
  await Deno.remove(filePath);

  // Remove parent directory
  const dir = filePath.split("/").slice(0, -1).join("/");
  try {
    await Deno.remove(dir);
  } catch {
    // Ignore if directory not empty
  }
}
```

---

## Environment Variables

### Reading Environment Variables

```typescript
// Get environment variable
const apiKey = Deno.env.get("OPENAI_API_KEY");

if (!apiKey) {
  throw new Error("OPENAI_API_KEY not set");
}

// Get with default value
const port = parseInt(Deno.env.get("PORT") || "8000");

// Get multiple required vars
const requiredVars = ["OPENAI_API_KEY", "SUPABASE_URL", "QDRANT_URL"];

for (const varName of requiredVars) {
  if (!Deno.env.get(varName)) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
}
```

### Environment Configuration Helper

```typescript
// lib/config.ts
export class Config {
  static getRequired(key: string): string {
    const value = Deno.env.get(key);
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  }

  static getOptional(key: string, defaultValue: string): string {
    return Deno.env.get(key) || defaultValue;
  }

  static getNumber(key: string, defaultValue: number): number {
    const value = Deno.env.get(key);
    return value ? parseInt(value, 10) : defaultValue;
  }

  static getBoolean(key: string, defaultValue: boolean): boolean {
    const value = Deno.env.get(key);
    if (!value) return defaultValue;
    return value === "true" || value === "1";
  }
}

// Usage
const openaiKey = Config.getRequired("OPENAI_API_KEY");
const port = Config.getNumber("PORT", 8000);
const debugMode = Config.getBoolean("DEBUG", false);
```

### .env File Loading (Development)

```typescript
// Load .env file (dev only - use env vars in production)
import { load } from "https://deno.land/std@0.210.0/dotenv/mod.ts";

if (Deno.env.get("ENVIRONMENT") === "development") {
  await load({ export: true });
}
```

---

## HTTP Server with Hono

### Basic Server Setup

```typescript
// main.ts
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors({
  origin: ["http://localhost:5173"],
  credentials: true
}));

// Routes
app.get("/", (c) => c.text("Hello, Deno!"));

app.get("/health", (c) => c.json({
  status: "healthy",
  timestamp: new Date().toISOString()
}));

// Start server
const port = parseInt(Deno.env.get("PORT") || "8000");

Deno.serve({ port }, app.fetch);

console.log(`🚀 Server running on http://localhost:${port}`);
```

### Route Organization

```typescript
// routes/documents/process.ts
import { Hono } from "hono";

const documentsRoutes = new Hono();

documentsRoutes.post("/process", async (c) => {
  const { document_id } = await c.req.json();

  // Process document...

  return c.json({ success: true, documentId: document_id });
});

export default documentsRoutes;

// main.ts
import documentsRoutes from "./routes/documents/process.ts";

app.route("/v1/documents", documentsRoutes);
```

### Request Handling

```typescript
// GET request with query params
app.get("/search", (c) => {
  const query = c.req.query("q");       // Single value
  const limit = c.req.query("limit");   // Optional

  return c.json({ query, limit });
});

// POST request with JSON body
app.post("/documents", async (c) => {
  const body = await c.req.json();

  const { name, projectId } = body;

  return c.json({ name, projectId });
});

// Route parameters
app.get("/documents/:id", (c) => {
  const id = c.req.param("id");

  return c.json({ documentId: id });
});

// Headers
app.get("/auth", (c) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  return c.json({ token });
});
```

### Response Types

```typescript
// JSON response
app.get("/data", (c) => c.json({ data: "value" }, 200));

// Text response
app.get("/text", (c) => c.text("Plain text"));

// HTML response
app.get("/html", (c) => c.html("<h1>Hello</h1>"));

// Redirect
app.get("/old", (c) => c.redirect("/new", 301));

// Custom headers
app.get("/custom", (c) => {
  c.header("X-Custom-Header", "value");
  return c.json({ data: "value" });
});

// Binary response
app.get("/file", async (c) => {
  const fileData = await Deno.readFile("./document.pdf");

  c.header("Content-Type", "application/pdf");
  return c.body(fileData);
});
```

---

## Middleware Patterns

### Authentication Middleware

```typescript
import { Context, Next } from "hono";

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.substring(7);

  // Validate token (Supabase example)
  const user = await validateToken(token);

  if (!user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  // Attach user to context
  c.set("userId", user.id);
  c.set("userEmail", user.email);

  await next();
}

// Usage
app.get("/protected", authMiddleware, (c) => {
  const userId = c.get("userId");
  return c.json({ message: `Hello, ${userId}` });
});
```

### Error Handling Middleware

```typescript
app.onError((err, c) => {
  console.error("Error:", err);

  if (err instanceof ValidationError) {
    return c.json({ error: err.message }, 400);
  }

  if (err instanceof AuthError) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return c.json({ error: "Internal server error" }, 500);
});
```

### Request Logging Middleware

```typescript
app.use("*", async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  console.log(`${method} ${path} ${status} ${duration}ms`);
});
```

---

## Error Handling

### Custom Error Classes

```typescript
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = "APIError";
  }
}

export class ValidationError extends APIError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

export class AuthenticationError extends APIError {
  constructor(message = "Unauthorized") {
    super(message, 401, "AUTH_ERROR");
  }
}

export class NotFoundError extends APIError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, "NOT_FOUND");
  }
}
```

### Error Handling in Routes

```typescript
app.post("/documents/process", async (c) => {
  try {
    const body = await c.req.json();

    // Validation
    if (!body.document_id) {
      throw new ValidationError("document_id is required");
    }

    // Authorization
    const userId = c.get("userId");
    const hasAccess = await checkAccess(userId, body.document_id);

    if (!hasAccess) {
      throw new AuthenticationError("Access denied");
    }

    // Processing
    const result = await processDocument(body.document_id);

    return c.json({ success: true, result });
  } catch (error) {
    if (error instanceof APIError) {
      return c.json({ error: error.message }, error.statusCode);
    }

    console.error("Unexpected error:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
```

---

## Testing

### Unit Testing with Deno.test

```typescript
// lib/utils.test.ts
import { assertEquals, assertThrows } from "https://deno.land/std@0.210.0/assert/mod.ts";
import { calculateTotal } from "./utils.ts";

Deno.test("calculateTotal - sums array of numbers", () => {
  const result = calculateTotal([1, 2, 3, 4]);
  assertEquals(result, 10);
});

Deno.test("calculateTotal - handles empty array", () => {
  const result = calculateTotal([]);
  assertEquals(result, 0);
});

Deno.test("calculateTotal - throws on invalid input", () => {
  assertThrows(
    () => calculateTotal([1, 2, "invalid"] as any),
    TypeError,
    "Invalid number"
  );
});
```

### API Testing

```typescript
// routes/documents.test.ts
import { Hono } from "hono";
import documentsRoutes from "./documents.ts";

Deno.test("POST /documents/process - success", async () => {
  const app = new Hono();
  app.route("/", documentsRoutes);

  const req = new Request("http://localhost/process", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer test-token"
    },
    body: JSON.stringify({
      document_id: "doc-123"
    })
  });

  const res = await app.fetch(req);

  assertEquals(res.status, 200);

  const json = await res.json();
  assertEquals(json.success, true);
});

Deno.test("POST /documents/process - missing document_id", async () => {
  const app = new Hono();
  app.route("/", documentsRoutes);

  const req = new Request("http://localhost/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  const res = await app.fetch(req);

  assertEquals(res.status, 400);
});
```

### Running Tests

```bash
# Run all tests
deno test --allow-net --allow-read --allow-write

# Run specific test file
deno test lib/utils.test.ts

# Run tests with coverage
deno test --coverage=coverage/

# Generate coverage report
deno coverage coverage/
```

---

## 🚨 Troubleshooting Common Issues

### Issue 1: Permission Denied Errors

**Symptom**: `error: Requires read access to "./file.ts"`

**Cause**: Missing permission flags

**Solution**:
```bash
# Check what permissions your code needs
# Network access
deno run --allow-net main.ts

# File system
deno run --allow-read --allow-write main.ts

# Environment variables
deno run --allow-env main.ts

# All permissions (development only)
deno run -A main.ts

# Specific permissions
deno run --allow-net=api.openai.com --allow-env=OPENAI_API_KEY main.ts
```

**Best Practice**: Use minimal permissions in production, specific hosts for `--allow-net`

---

### Issue 2: Module Not Found Errors

**Symptom**: `error: Module not found "file:///..."`

**Cause**: Incorrect import paths or missing `.ts` extension

**Solution**:
```typescript
// ❌ Wrong - missing extension
import { helper } from "./utils";

// ✅ Correct
import { helper } from "./utils.ts";

// ❌ Wrong - using Node.js resolution
import { helper } from "./lib";

// ✅ Correct - explicit file
import { helper } from "./lib/index.ts";
```

**Debugging**:
```bash
# Check import map resolution
deno info main.ts

# See full dependency tree
deno info --json main.ts
```

---

### Issue 3: CORS Errors in Development

**Symptom**: Browser console shows CORS policy errors

**Cause**: Frontend (localhost:5173) cannot access API (localhost:8000)

**Solution**:
```typescript
// Add CORS middleware before routes
import { cors } from "hono/cors";

app.use("*", cors({
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  credentials: true,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"]
}));

// Then define routes
app.post("/api/endpoint", async (c) => {
  // Handler code
});
```

**Verification**:
```bash
# Test CORS headers
curl -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -X OPTIONS http://localhost:8000/api/endpoint -v
```

---

### Issue 4: Environment Variables Not Loading

**Symptom**: `Deno.env.get("VAR")` returns `undefined`

**Cause**: Missing `--allow-env` permission or `.env` file not loaded

**Solution**:
```typescript
// Option 1: Manual .env loading
import { load } from "std/dotenv/mod.ts";
await load({ export: true });

// Option 2: Use deno task (auto-loads .env)
// deno.jsonc
{
  "tasks": {
    "dev": "deno run --allow-all --watch main.ts"
  }
}

// Option 3: Explicit permission
// deno run --allow-env=OPENAI_API_KEY,DATABASE_URL main.ts
```

**Debugging**:
```typescript
// Check if environment variable is loaded
console.log("OPENAI_API_KEY:", Deno.env.get("OPENAI_API_KEY") ? "loaded" : "missing");

// List all environment variables (dev only)
if (Deno.env.get("ENVIRONMENT") === "development") {
  console.log("Available env vars:", Object.keys(Deno.env.toObject()));
}
```

---

### Issue 5: Slow Startup Time

**Symptom**: `deno run` takes 5+ seconds to start

**Cause**: Downloading dependencies on every run

**Solution**:
```bash
# Cache dependencies explicitly
deno cache main.ts

# Lock dependencies for consistency
deno cache --lock=deno.lock --lock-write main.ts

# Use cached dependencies
deno run --cached-only main.ts

# Check cache location
deno info
```

**Optimize Imports**:
```typescript
// ❌ Slow - imports entire library
import OpenAI from "npm:openai@^4.0.0";

// ✅ Faster - import map in deno.jsonc
// deno.jsonc:
{
  "imports": {
    "openai": "npm:openai@^4.67.3"
  }
}

// Then in code:
import OpenAI from "openai";
```

---

### Issue 6: Type Errors from npm Packages

**Symptom**: `error: TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'`

**Cause**: npm packages may have incomplete or incompatible types

**Solution**:
```typescript
// Option 1: Use @ts-ignore for specific lines (last resort)
// @ts-ignore - npm package type mismatch
const result = await problematicFunction(arg);

// Option 2: Cast to correct type
const result = await problematicFunction(arg as ExpectedType);

// Option 3: Use any temporarily (development only)
const result = await problematicFunction(arg as any);

// Option 4: Check npm package version
// Sometimes newer versions have better types
{
  "imports": {
    "package": "npm:package@latest"
  }
}
```

**Best Practice**: File issue with npm package maintainers about type errors

---

## Deployment

### Production Configuration

```typescript
// Optimize for production
const isProduction = Deno.env.get("ENVIRONMENT") === "production";

if (isProduction) {
  // Disable detailed error messages
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "Internal server error" }, 500);
  });

  // Enable strict CORS
  app.use("*", cors({
    origin: Deno.env.get("FRONTEND_URL")!,
    credentials: true
  }));
}
```

### Deno Deploy

```bash
# Install deployctl
deno install --allow-read --allow-write --allow-env --allow-net --allow-run --no-check -r -f https://deno.land/x/deploy/deployctl.ts

# Deploy to Deno Deploy
deployctl deploy --project=insightsphere main.ts
```

### Docker Deployment

```dockerfile
FROM denoland/deno:2.5.2

WORKDIR /app

# Copy source code
COPY . .

# Cache dependencies
RUN deno cache main.ts

# Expose port
EXPOSE 8000

# Run application
CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "main.ts"]
```

### Environment Variables (Production)

```bash
# Don't use .env files in production
# Set env vars directly in deployment platform

# Example: Railway, Fly.io, AWS ECS
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
QDRANT_URL=https://...
PORT=8000
ENVIRONMENT=production
```

---

## Related Documentation

- [Design Principles](design-principles.md) - Coding standards
- [Multi-Service](multiservice.md) - Service coordination
- [Architecture](architecture.md) - System architecture

---

**Last Updated**: 2025-11-29
**Maintained By**: InsightSphere Backend Team
