import { assert, assertEquals, assertFalse, assertNotEquals } from "@std/assert";
import { Hono } from "hono";
import type { AppEnv } from "../../lib/auth.ts";
import { decryptKey, parseSecret } from "../../lib/keyCrypto.ts";
import type {
  NewUserApiKeyRow,
  UserApiKeyRow,
  UserApiKeyStore,
} from "../../lib/userApiKeyRow.ts";
import { createApiKeyRoutes, NOT_ENABLED } from "./apiKeyRoutes.ts";

const KEY = ["sk", "proj", "abcdefghijklmnopqrstuvwxyz0123456789"].join("-");
const USER = "jwt-user";
const PATH = "/v1/settings/api-key";

async function secret(): Promise<CryptoKey> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const key = await parseSecret(btoa(String.fromCharCode(...bytes)));
  assert(key);
  return key;
}

interface FakeStore extends UserApiKeyStore {
  rows: Map<string, UserApiKeyRow>;
  calls: string[];
}

function fakeStore(): FakeStore {
  const rows = new Map<string, UserApiKeyRow>();
  const calls: string[] = [];
  let tick = 0;
  const stamp = () => new Date(Date.UTC(2026, 9, 1, 0, 0, tick++)).toISOString();
  return {
    rows,
    calls,
    getKeyRow: (userId) => {
      calls.push(`get:${userId}`);
      return Promise.resolve(rows.get(userId) ?? null);
    },
    saveKeyRow: (row: NewUserApiKeyRow) => {
      calls.push(`save:${row.user_id}`);
      const now = stamp();
      const saved = {
        ...row,
        created_at: rows.get(row.user_id)?.created_at ?? now,
        updated_at: now,
      };
      rows.set(row.user_id, saved);
      return Promise.resolve(saved);
    },
    deleteKeyRow: (userId) => {
      calls.push(`delete:${userId}`);
      rows.delete(userId);
      return Promise.resolve();
    },
  };
}

interface Setup {
  secret?: CryptoKey | null;
  store?: FakeStore;
  verifyError?: unknown;
}

async function setup(opts: Setup = {}) {
  const store = opts.store ?? fakeStore();
  const s = opts.secret === undefined ? await secret() : opts.secret;
  const verified: string[] = [];
  const routes = createApiKeyRoutes({
    secret: s,
    store,
    verifyKey: (apiKey) => {
      verified.push(apiKey);
      return "verifyError" in opts
        ? Promise.reject(opts.verifyError)
        : Promise.resolve();
    },
  });

  // Stands in for requireUser: the user is whatever the JWT said.
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: USER });
    await next();
  });
  app.get(PATH, routes.getApiKey);
  app.put(PATH, routes.putApiKey);
  app.delete(PATH, routes.deleteApiKey);
  return { app, store, verified, secret: s };
}

const put = (body: string) => ({
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body,
});

async function captureLogs(fn: () => Promise<unknown>): Promise<string> {
  const original = { log: console.log, warn: console.warn, error: console.error };
  const lines: string[] = [];
  const record = (...args: unknown[]) => lines.push(Deno.inspect(args));
  console.log = record;
  console.warn = record;
  console.error = record;
  try {
    await fn();
  } finally {
    Object.assign(console, original);
  }
  return lines.join("\n");
}

// Without a server secret the feature is off. Touching the store or OpenAI
// then would either save an unencrypted value or spend the user's credit for
// nothing.
Deno.test("every route answers 503 when no secret is configured", async () => {
  const { app, store, verified } = await setup({ secret: null });
  for (const init of [{}, put(JSON.stringify({ apiKey: KEY })), { method: "DELETE" }]) {
    const res = await app.request(PATH, init);
    assertEquals(res.status, 503);
    assertEquals((await res.json()).error, NOT_ENABLED);
  }
  assertEquals(store.calls, []);
  assertEquals(verified, []);
});

Deno.test("GET with no saved key says so", async () => {
  const { app } = await setup();
  const res = await app.request(PATH);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), {
    hasKey: false,
    hint: null,
    provider: null,
    updatedAt: null,
  });
});

// The key must never come back out of the API, even though the stored row
// has everything needed to recover it.
Deno.test("GET returns the hint and never the key, ciphertext or IV", async () => {
  const { app, store } = await setup();
  await app.request(PATH, put(JSON.stringify({ apiKey: KEY })));
  const row = store.rows.get(USER);
  assert(row);

  const res = await app.request(PATH);
  const text = await res.text();
  assertEquals(JSON.parse(text), {
    hasKey: true,
    hint: "sk-…6789",
    provider: "openai",
    updatedAt: row.updated_at,
  });
  for (const forbidden of ["ciphertext", '"iv"', "apiKey", KEY, row.ciphertext, row.iv]) {
    assertFalse(text.includes(forbidden), `response contains ${forbidden}`);
  }
});

// Anything that is plainly not a key is refused before it costs an OpenAI
// call or reaches the store.
Deno.test("PUT refuses a body that is not a key, without calling OpenAI", async () => {
  const { app, store, verified } = await setup();
  const bodies = [
    "not json",
    "{}",
    JSON.stringify({ apiKey: 12345 }),
    JSON.stringify({ apiKey: "pk-" + "a".repeat(30) }),
    JSON.stringify({ apiKey: "sk-" + "short" }),
    JSON.stringify({ apiKey: "sk-" + "a".repeat(400) }),
    JSON.stringify({ apiKey: "sk-abc def" + "a".repeat(20) }),
    JSON.stringify([KEY]),
  ];
  for (const body of bodies) {
    const res = await app.request(PATH, put(body));
    assertEquals(res.status, 400, body);
  }
  assertEquals(verified, []);
  assertEquals(store.calls, []);
});

// A key pasted with a trailing newline is still the same key.
Deno.test("PUT trims whitespace around the key", async () => {
  const { app, verified } = await setup();
  const res = await app.request(PATH, put(JSON.stringify({ apiKey: `  ${KEY}\n` })));
  assertEquals(res.status, 200);
  assertEquals(verified, [KEY]);
});

// Each OpenAI failure has its own sentence, nothing is saved, and neither the
// logs nor the response carry the key or OpenAI's own message.
Deno.test("PUT maps each OpenAI failure, saves nothing and leaks nothing", async () => {
  const cases: [unknown, number, string][] = [
    [{ status: 401, code: "invalid_api_key" }, 400, "OpenAI rejected this key."],
    [{ status: 403 }, 400, "This key cannot use the text-embedding-3-small model."],
    [{ status: 404, code: "model_not_found" }, 400, "This key cannot use the text-embedding-3-small model."],
    [{ status: 429 }, 400, "This key has no credit left or is rate limited. Check your OpenAI billing."],
    [{ status: 429, code: "insufficient_quota" }, 400, "This key has no credit left or is rate limited. Check your OpenAI billing."],
    [{ status: undefined, code: undefined }, 502, "Could not reach OpenAI. Nothing was saved. Try again."],
    [new Error("Connection error."), 502, "Could not reach OpenAI. Nothing was saved. Try again."],
    [{ status: 500 }, 502, "Could not reach OpenAI. Nothing was saved. Try again."],
  ];
  for (const [shape, status, message] of cases) {
    const err = typeof shape === "object" && shape !== null && !(shape instanceof Error)
      ? { ...shape, message: `Incorrect API key provided: ${KEY}` }
      : shape;
    const { app, store } = await setup({ verifyError: err });
    let res: Response | undefined;
    let body = "";
    const logged = await captureLogs(async () => {
      res = await app.request(PATH, put(JSON.stringify({ apiKey: KEY })));
      body = await res.text();
    });
    assertEquals(res?.status, status);
    assertEquals(JSON.parse(body).error, message);
    assertEquals(store.calls, []);
    assertFalse(logged.includes(KEY), "log contains the key");
    assertFalse(logged.includes("abcdefghij"), "log contains part of the key");
    assertFalse(body.includes("Incorrect API key"));
  }
});

// The saved row has to decrypt back to the key, belong to the JWT user, and
// keep only the last four characters in the clear.
Deno.test("PUT saves the key encrypted and answers with the GET shape", async () => {
  const { app, store, secret: s } = await setup();
  let res: Response | undefined;
  const logged = await captureLogs(async () => {
    res = await app.request(PATH, put(JSON.stringify({ apiKey: KEY })));
  });
  assertEquals(res?.status, 200);
  const row = store.rows.get(USER);
  assert(row && s);
  assertEquals(row.key_hint, "6789");
  assertEquals(atob(row.iv).length, 12);
  assertNotEquals(row.ciphertext, KEY);
  assertEquals(await decryptKey(s, row, USER), KEY);
  assertEquals(await res?.json(), {
    hasKey: true,
    hint: "sk-…6789",
    provider: "openai",
    updatedAt: row.updated_at,
  });
  assertFalse(logged.includes(KEY));
  assertFalse(logged.includes(row.ciphertext));
});

Deno.test("saving twice keeps one row and moves updated_at", async () => {
  const { app, store } = await setup();
  await app.request(PATH, put(JSON.stringify({ apiKey: KEY })));
  const first = store.rows.get(USER);
  await app.request(PATH, put(JSON.stringify({ apiKey: KEY.replace("6789", "0000") })));
  const second = store.rows.get(USER);
  assert(first && second);
  assertEquals(store.rows.size, 1);
  assertEquals(second.key_hint, "0000");
  assertEquals(second.created_at, first.created_at);
  assertNotEquals(second.updated_at, first.updated_at);
});

// Removing a key that is not there is not an error: the end state is the same.
Deno.test("DELETE answers 200 with or without a key, and GET then shows none", async () => {
  const { app, store } = await setup();
  await app.request(PATH, put(JSON.stringify({ apiKey: KEY })));
  const noKey = { hasKey: false, hint: null, provider: null, updatedAt: null };

  for (let i = 0; i < 2; i++) {
    const res = await app.request(PATH, { method: "DELETE" });
    assertEquals(res.status, 200);
    assertEquals(await res.json(), noKey);
  }
  assertEquals(store.rows.size, 0);
  assertEquals(await (await app.request(PATH)).json(), noKey);
});

// A user id in the body or query must not let one user write or read another
// user's key.
Deno.test("the user comes from the JWT, not the body or the query", async () => {
  const { app, store } = await setup();
  await app.request(
    `${PATH}?user_id=other-user`,
    put(JSON.stringify({ apiKey: KEY, user_id: "other-user" })),
  );
  await app.request(`${PATH}?user_id=other-user`);
  await app.request(`${PATH}?user_id=other-user`, { method: "DELETE" });
  assertEquals(store.calls, [`save:${USER}`, `get:${USER}`, `delete:${USER}`]);
  assertFalse(store.rows.has("other-user"));
});
