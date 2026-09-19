# Local development

Three services run in Docker: Qdrant, the Go parser, and the API. The frontend
runs on the host so Vite's hot reload behaves normally.

```bash
cp dev/.env.example dev/.env     # Supabase URL + service role key, OpenAI key
./dev/start.sh                   # qdrant + doc-parser + api, waits for healthy
cd frontend && npm install && npm run start
```

| | | |
|---|---|---|
| App | http://localhost:5173 | run on the host |
| API | http://localhost:8000/health | |
| Parser | http://localhost:8080/health | not published in production |
| Qdrant | http://localhost:6333/dashboard | not published in production |

`./dev/start.sh --rebuild` forces an image rebuild. `dev/reset.sh` wipes the
local data volumes.

## Picking up a change

| Changed | Do this |
|---|---|
| API code | `docker compose -f dev/compose.yaml restart api` |
| `dev/.env` | `docker compose -f dev/compose.yaml up -d --force-recreate api` |
| Parser code | `docker compose -f dev/compose.yaml up -d --build doc-parser` |
| Frontend | nothing, Vite reloads |
| Ran `npm run build` | **restart the frontend** — see below |

`restart` does not re-read the env file, which is the one that catches people
out. The API deliberately does not run under `deno --watch`: OCR holds large
buffers and the watcher pushed the container into swap.

**Running `npm run build` while the dev server is up breaks it.** The build
regenerates `.svelte-kit/generated/`, the running dev server hot-reloads those
files, and it picks up the production Content Security Policy along with them.
That policy has no `http://localhost:8000` in `connect-src`, because in
production the API is same-origin behind Caddy. Every API call then fails in the
browser with

    Refused to connect ... violates the following Content Security Policy
    directive: "connect-src 'self' https:"

while the same call from curl returns 200, which makes it look like a code bug.
Restart the frontend after any build.

## Checking the work

```bash
cd doc-parser && go vet ./... && go test ./...
docker compose -f dev/compose.yaml exec -T api deno check main.ts && deno lint \
  && deno test --allow-net --allow-env --allow-read --allow-write
cd frontend && npm run check && npm run lint && npm test && npm run build
./scripts/verify-security.sh     # needs the stack up and dev/.env filled in
```

CI runs the same three, plus the container image builds.
`scripts/verify-security.sh` checks access control from the outside — anonymous
reads return nothing, anonymous writes are rejected, removed endpoints stay
removed. Worth running after any change to auth or the schema.

## When something is wrong

**A document sticks in `processing`.** The work runs in-process, so a restart
abandons it. A startup reaper marks anything stranded as `failed`; the reason
lands in `project_files.processing_error`.

**A PDF finishes with no text.** It is a scanned page and OCR produced nothing
usable. `docker compose -f dev/compose.yaml logs doc-parser` reports per-page
failures, and the API refuses to mark a document `ready` with zero chunks.

**Chat answers "I don't have enough relevant information".** Check the project
has a collection with points in it:

```bash
curl -s http://localhost:6333/collections | python -m json.tool
```

Collections are named `insightsphere-documents_user_{userId}_project_{projectId}`.
An empty or missing one means nothing was ever indexed for that project.

**Embeddings fail.** There is no fallback, by design: a second provider would
produce different dimensions, and mixing them makes search return nothing
rather than fail loudly. Fix the OpenAI key.
