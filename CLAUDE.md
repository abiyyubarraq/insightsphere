# InsightSphere — working notes

Upload documents to a project, ask questions about them, get answers with
citations back to the exact page.

[README.md](README.md) explains what the system does and why it is built the way
it is. This file is the part an agent needs that the README does not say: where
things live, what the real numbers are, and what not to do.

**Trust order:** the code, then `supabase/migrations/` for the schema, then
README.md, then this file. No other document in this repo is authoritative. If
something here disagrees with the code, the code is right and this file is a
bug.

---

## Layout

```
api/            Deno 2.5 + Hono
  lib/          qdrant, openai, supabase, chunking, retrieval, RAG orchestration
  routes/       documents, projects, search, chat, searchFiles
doc-parser/     Go 1.24 OCR service (Gin + pdftoppm + tesseract)
frontend/       SvelteKit 2 + Svelte 5 runes, TailwindCSS v4 + DaisyUI
shared/         types and constants used by both the frontend and the API
supabase/       migrations: schema, RLS, constraints
dev/            docker compose for local development
docker/         production compose, Dockerfiles, Caddy
scripts/        security verification, schema dump
```

Running it, changing it, checking it: [dev/README.md](dev/README.md).

| Layer | Technology |
|---|---|
| Frontend | Svelte 5 + SvelteKit 2, TailwindCSS v4 + DaisyUI, Lucide icons |
| API | Deno 2.5+ + Hono |
| Parser | Go 1.24 + Gin, poppler + Tesseract |
| Vectors | Qdrant, one collection per project |
| Database | Supabase Postgres, RLS on every table |
| Storage | Supabase Storage |
| AI | OpenAI `text-embedding-3-small` and `gpt-4o-mini` |

---

## The numbers that are easy to get wrong

Every value below is in the code. Do not copy a number out of this table into
new code — import it.

| Thing | Value | Where |
|---|---|---|
| Collection name | `insightsphere-documents_user_{userId}_project_{projectId}` | `api/lib/qdrantClient.ts` |
| Collection prefix | `QDRANT_COLLECTION`, default `insightsphere-documents` | `api/lib/config.ts` |
| Embedding model | `text-embedding-3-small`, 1536 dims, cosine | `shared/constants/index.ts` |
| Embedding batch size | 20 | `api/lib/openaiClient.ts` |
| Chunk size | 800 tokens (~3200 chars) | `api/routes/documents/process.ts` |
| Chunk overlap | **50** tokens, not 100 | same |
| Sentence preservation | **off** — character splitting, deliberately, for memory | same |
| Chunks per query | 5 | `shared/constants/index.ts` |
| Similarity threshold | **0.30** | same |
| Sufficiency floor | 0.45 | same |
| Context length cap | 4000 chars | same |
| Max file size | 100 MB, enforced in the browser *and* in the API | same |
| Max pages | 1000 | same |
| Text layer floor | 20 runes and 10 letters per page, below which the page goes to OCR | `doc-parser/utils/text_layer.go` |
| Storage bucket | `SUPABASE_STORAGE_BUCKET`, default `anotherbrainfileplayground` | `api/lib/config.ts` |
| Storage path | `{userId}/{projectId}/{timestamp}_{filename}` | `frontend/src/services/supabase.ts` |
| Daily quotas | per tier in the `quota_tiers` table, not in code; no `user_tiers` row = `basic` | `supabase/migrations/0006_quota.sql` |
| Burst limit | 20 requests/minute per user on chat, query, process, summary | `api/main.ts` |

The threshold is low on purpose and has been measured on this corpus. Raising it
to 0.35 drops real queries: "What is psychological inoculation?" goes from 9
hits to 0, and the Indonesian phrasing of a question that scores 0.684 in
English scores 0.399. The cost of keeping it low is that an unanswerable
question returns weak chunks, which is what the sufficiency floor is for — the
answer is still given, and flagged.

---

## Endpoints

Every one needs `Authorization: Bearer <supabase-jwt>`. There is no other way
in: no admin mode, no shared secret, no test routes.

| Method | Path |
|---|---|
| `POST` | `/v1/documents/process` — returns **202**, work runs in the background |
| `POST` | `/v1/documents/generateSummary` |
| `DELETE` | `/v1/documents/:documentId` |
| `POST` | `/v1/projects/:projectId/chat` — conversational RAG |
| `POST` | `/v1/projects/:projectId/query` — one-shot, no history |
| `GET` | `/v1/projects/:projectId/query/suggestions` |
| `DELETE` | `/v1/projects/:projectId` |
| `POST` | `/v1/search/query` — raw chunks, no generation |
| `POST` | `/v1/searchFiles` — file library, filename or semantic |
| `GET` | `/health` |

Chat, query, process and summary answer **429** at a daily quota or the burst
limit, with a sentence meant for the user in `error`. Process answers **409**
for a document already processing; summary answers **409** when one exists,
unless the body has `regenerate: true`. A **503** means the quota or Supabase
Auth could not be checked — never read it as signed out.

---

## Ingestion

```
upload to Supabase Storage, insert project_files row
        |
POST /v1/documents/process  -> 202 immediately, client polls status
        |
   background: ownership check, download by the path ON THE ROW
        |
   doc-parser: PDF -> text layer per page, and ONLY pages with none
                      -> greyscale PNG -> tesseract
               DOCX -> word/document.xml     (no OCR)
               txt/md -> read as-is           (no OCR)
        |
   chunk per page, 800 tokens, 50 overlap
        |
   embed in batches of 20, text-embedding-3-small
        |
   delete existing points for the document, then upsert
        |
   status: ready, or failed with processing_error set
```

Chunk IDs are a UUID v5 over `documentId_page_chunkIndex`. Qdrant upserts by
point ID, so reprocessing replaces rather than appends. This is load-bearing:
when the ID was random, 43% of the vector store became duplicates.

## Answering

```
first turn                    follow-up turn
  question                      question ------------------+
     |                             |                        |
     |                             +-> rewrite (gpt-4o-mini,|
     |                                 temp 0, 1.5s, falls  |
     |                                 back to original)    |
     |                                        |             |
  embed                                 embed both ---------+
     |                                        |
  search                             search twice, fuse by RRF
     |                                        |
     +------------> drop duplicate passages <-+
                             |
                    top k, ordered by score
                             |
                 [doc_id: N] context -> gpt-4o-mini
```

Order matters at the end. `citationService.buildContext` numbers chunks in the
order it is given them, the model cites `[doc_id: N]`, and the frontend maps `N`
back to the Nth citation by position. Both the chat route and the history reload
sort citations by score, so the list handed to `buildContext` must be in score
order too. `api/lib/retrieval.ts` does that after fusion, and a test pins it.

---

## What not to do

**Never add an embedding fallback.** Documents and queries must be embedded by
the same model or search returns nothing. A second provider means different
dimensions. Failing loudly is the cheaper outcome. There is no
`embeddingClient.ts` and there should not be one again.

**Never log document text.** IDs, lengths and counts only.

```ts
console.log("Processing document:", { documentId, fileName, textLength, chunkCount });
```

**Never trust a path from the request body.** Read `storage_path` off the
document row. The API holds the service-role key, which bypasses RLS, so it has
to check ownership itself — `supabaseService.userHasProjectAccess` before
anything else.

**Never let a collection be recreated to fix a dimension mismatch.** That
deletes every document in the project. `ensureCollection` throws instead.
Changing embedding model is a migration, not a side effect.

**Always search with `useProjectCollection: true`** and pass both `userId` and
`projectId`. Collections are per project; getting this wrong is how one tenant
sees another.

**Do not put a number in the answer prompt that is not in the context.** The
system prompt forbids arithmetic, and `buildContext` deliberately emits no
similarity scores — if a number is not in the context, the model cannot restate
it.

**Stack:** Deno for the API, TypeScript everywhere, Svelte 5 runes, Go for the
parser, DaisyUI for components. Not Node, not Python, not plain JavaScript, not
another UI library.

**TypeScript is strict** in both `api/deno.jsonc` and `frontend/tsconfig.json`.
CI runs `deno check`, `deno lint`, `svelte-check` and `eslint`; a missing
`await` sat in master for months because nothing type-checked the API.

---

## Conventions

**Frontend** uses the `$lib` alias, Svelte 5 runes (`$state`, `$derived`,
`$effect`, `$props`, `$bindable`), and plain `onclick` handlers — no `on:`
directives. Inline handlers in generated HTML are forbidden: the CSP has no
`unsafe-inline` for scripts, so citation chips use `data-` attributes and one
delegated listener.

**Theme** lives in `frontend/src/app.css` as a Tailwind v4
`@plugin "daisyui/theme"` block, in oklch. There is no `tailwind.config.js`;
Tailwind v4 is configured from CSS. Use DaisyUI tokens (`btn-primary`,
`bg-base-100`, `text-warning`), never hex.

**API** uses relative imports with explicit `.ts` extensions, and bare
specifiers from the import map in `api/deno.jsonc` for npm and JSR packages.
Shared code is `../../shared/...`.

**Tests** are flat `Deno.test("sentence-style name", ...)` with `@std/assert`,
a comment above each saying which bug it prevents, and plain object factories
instead of mocks. Modules that construct a client at import time cannot be
tested, so pure logic goes in its own module — see `api/lib/retrieval.ts` and
`api/lib/queryRewrite.ts`.

---

## Agents

Task-specific playbooks live in `.claude/agents/`, which is local only and not
in the repo (`.claude/`, `.mcp.json` and `.env` files are gitignored):
code-reviewer, design-reviewer, planning-specialist, research-specialist,
senior-developer, ui-specialist, rag-specialist, embedding-specialist,
go-service-specialist, microservices-coordinator.
