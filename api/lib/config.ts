/**
 * Environment validation.
 *
 * The service clients are module-scope singletons that throw on construction,
 * so a missing variable used to surface as whichever client happened to be
 * imported first — one crash per missing value. This reports all of them at
 * once, before those modules are loaded.
 */

const REQUIRED = [
  ["SUPABASE_URL", "Supabase project URL"],
  ["SUPABASE_SERVICE_ROLE_KEY", "Supabase service role key (server only)"],
  ["OPENAI_API_KEY", "OpenAI API key for embeddings and chat"],
] as const;

const OPTIONAL = [
  ["PORT", "8000"],
  ["QDRANT_URL", "http://localhost:6333"],
  ["DOC_PARSER_URL", "http://localhost:8080"],
  ["SUPABASE_STORAGE_BUCKET", "anotherbrainfileplayground"],
  ["QDRANT_COLLECTION", "insightsphere-documents"],
] as const;

export function assertEnv(): void {
  const missing = REQUIRED.filter(([k]) => !Deno.env.get(k)?.trim());

  if (missing.length > 0) {
    console.error("\nMissing required environment variables:\n");
    for (const [key, why] of missing) console.error(`  ${key}  — ${why}`);
    console.error("\nCopy dev/.env.example to dev/.env and fill these in.\n");
    Deno.exit(1);
  }

  const defaulted = OPTIONAL.filter(([k]) => !Deno.env.get(k)?.trim());
  if (defaulted.length > 0) {
    console.log(
      `Using defaults for: ${defaulted.map(([k, v]) => `${k}=${v}`).join(", ")}`,
    );
  }
}
