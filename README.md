# InsightSphere

Upload documents to a project, then ask questions about them and get answers with citations back to the exact page.

Takes PDF, DOCX, TXT and Markdown. Scanned PDFs are handled by rendering each page and running OCR over it, so documents with no text layer work the same as ones that have it.

---

## How it works

```
  Browser (SvelteKit 5)
      |  JWT
      v
  API (Deno + Hono) --------> doc-parser (Go)
      |                          |  pdftoppm  -> greyscale PNG per page
      |                          +- tesseract -> text per page
      |
      +--> OpenAI      embeddings + answer generation
      +--> Qdrant      one collection per project
      +--> Supabase    Postgres, auth, file storage
```

Ingestion, in order:

1. The browser uploads to Supabase Storage and inserts a row in `project_files`.
2. `POST /v1/documents/process` checks ownership and returns **202** straight away.
3. In the background: a PDF is rendered to PNG per page and OCR'd; DOCX text is read out of its XML; plain text is read as-is. Only PDF needs OCR.
4. Pages are chunked to roughly 800 tokens, embedded with `text-embedding-3-small`, and upserted into that project's Qdrant collection.
5. The row moves to `ready`, or to `failed` with the reason recorded. The UI polls until then.

Asking a question embeds it with the *same* model, searches only that project's collection, and hands the top chunks to the model with instructions to answer from them alone. Each chunk carries its filename and page number, which become the clickable citations.

A follow-up question is rewritten into one that stands on its own before it is searched for, because "and what about the second one?" matches nothing on its own. Both the original and the rewrite are searched and the two result lists are fused, since a rewrite used alone retrieves worse than a rewrite plus the original. When the best chunk is still a weak match the answer is given anyway, and labelled as one.

---

## Design decisions

**One Qdrant collection per project**, named `insightsphere-documents_user_{userId}_project_{projectId}`. Leaking across tenants would take the wrong collection name rather than a forgotten `WHERE` clause, and deleting a project becomes a single call. The cost is that search cannot span projects.

**Chunk IDs are deterministic** — a UUID v5 over `documentId_page_chunkIndex`. Qdrant upserts by point ID, so reprocessing replaces chunks rather than adding more. An earlier version returned a random UUID from a function whose name promised otherwise, which left 43% of the vector store as duplicates and meant a top-5 search could come back as the same paragraph five times.

**Only PDF pays for OCR.** DOCX already holds its text in `word/document.xml`, and `.txt`/`.md` are text already, so both skip rendering entirely and finish in under a second. Markdown is kept as written rather than stripped: `## Results` is a better chunk boundary and a better embedding than `Results` on its own. Neither format records page breaks, so their citations name the file but not a page.

**No embedding fallback.** If OpenAI is unavailable the request fails. A second provider means different dimensions, so the search would either error or quietly return nothing useful. Failing loudly is the cheaper outcome.

**Processing is detached from the request.** OCR on a large PDF runs for minutes and no proxy holds a connection open that long. The endpoint returns 202 and the client polls.

**Queries and documents are normalised the same way** before embedding. They were not, once, and the two halves of the search were built from different text.

---

## Quick start

Needs Docker, Node 22+, a Supabase project and an OpenAI key.

```bash
git clone https://github.com/abiyyubarraq/insightsphere.git
cd insightsphere

cp dev/.env.example dev/.env     # fill in Supabase + OpenAI
```

Apply the schema: in the Supabase SQL editor run the files in `supabase/migrations/` in order. They create the six tables, switch on row level security for all of them, and add the policies.

```bash
./dev/start.sh                   # qdrant + doc-parser + api
cd frontend && npm install && npm run start
```

| | |
|---|---|
| App | http://localhost:5173 |
| API | http://localhost:8000/health |
| Qdrant | http://localhost:6333/dashboard |

The frontend runs outside Docker so Vite's hot reload behaves normally.

---

## API

Every endpoint needs `Authorization: Bearer <supabase-jwt>`. There is no other way in.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/documents/process` | Start OCR and indexing. Returns 202; poll `project_files.status` |
| `POST` | `/v1/documents/generateSummary` | Whole-document summary |
| `DELETE` | `/v1/documents/:documentId` | Removes vectors, page images, the file and the row |
| `POST` | `/v1/projects/:projectId/chat` | Conversational RAG with citations |
| `POST` | `/v1/projects/:projectId/query` | One-shot RAG, no history |
| `GET` | `/v1/projects/:projectId/query/suggestions` | Starter questions |
| `DELETE` | `/v1/projects/:projectId` | Drops the collection and everything under it |
| `POST` | `/v1/search/query` | Raw chunk search, no generation |
| `POST` | `/v1/searchFiles` | File library, by filename or semantic |
| `GET` | `/health` | Liveness |

```bash
curl -X POST http://localhost:8000/v1/projects/$PROJECT_ID/chat \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"message": "What method does this paper use?"}'
```

---

## Security

The anon key is public by design, since it ships in the browser bundle, so **row level security is the only thing protecting the data**. Every table has it on, scoped to `auth.uid()`, with `WITH CHECK` on writes so a client cannot create rows it does not own.

The API holds the service-role key, which bypasses RLS, so it verifies ownership itself before touching anything. It never trusts a storage path sent by the caller; it reads the one recorded on the document.

`scripts/verify-security.sh` asserts these from the outside: anonymous reads return nothing, anonymous writes are rejected with `42501`, and removed endpoints stay removed. Worth running after any change to the schema or to auth.

---

## Layout

```
api/            Deno + Hono
  lib/          qdrant, openai, supabase, chunking, RAG orchestration
  routes/       documents, projects, search, chat
doc-parser/     Go OCR service (pdftoppm + tesseract)
frontend/       SvelteKit 5, runes throughout
shared/         types and constants shared by the frontend and the API
supabase/       migrations: schema, RLS, constraints
dev/            docker compose for local development
scripts/        security verification, schema dump
```

---

## Current state

Working: upload and processing of PDF, DOCX, TXT and Markdown; OCR; chunking; embedding; per-project vector search; chat with page-level citations; document summaries; the file library; and deletion of documents and projects.

Tests: 81 across the three languages, run in CI along with the three container image builds.

Not done yet:

- **Background work is in-process.** A restart mid-run strands a document, which a startup reaper then marks failed. A real queue would be better.
- **`.doc`** (the old binary format) is not supported, only `.docx`.
- **No OCR for images inside a DOCX.** Its text is read, its pictures are not.
- **OCR defaults to English.** Set `OCR_LANGUAGES=eng+ind` for Indonesian; the image ships both.

---

## Licence

MIT, see [LICENSE](LICENSE).
