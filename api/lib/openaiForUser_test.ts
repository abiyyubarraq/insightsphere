import { assertEquals, assertStrictEquals } from "@std/assert";
import { openAIFor } from "./openaiForUser.ts";

const KEY = ["sk", "proj", "abcdefghijklmnopqrstuvwxyz0123456789"].join("-");

interface FakeClient {
  key: string;
}

const SERVER: FakeClient = { key: "server" };

function deps(saved: string | null) {
  const asked: string[] = [];
  const made: string[] = [];
  return {
    asked,
    made,
    deps: {
      getKey: (userId: string) => {
        asked.push(userId);
        return Promise.resolve(saved);
      },
      makeClient: (key: string): FakeClient => {
        made.push(key);
        return { key };
      },
      serverClient: SERVER,
    },
  };
}

// Saving a key did nothing: every call still went out on the server's key.
Deno.test("a user with a saved key gets a client built from that key", async () => {
  const { deps: d, asked, made } = deps(KEY);

  const chosen = await openAIFor("jwt-user", d);

  assertEquals(asked, ["jwt-user"]);
  assertEquals(made, [KEY]);
  assertEquals(chosen.client.key, KEY);
  assertEquals(chosen.own, true);
});

// `own` is what skips the daily quotas, so it must never be true by accident.
Deno.test("a user without a key gets the server client and own is false", async () => {
  const { deps: d, made } = deps(null);

  const chosen = await openAIFor("jwt-user", d);

  assertStrictEquals(chosen.client, SERVER);
  assertEquals(chosen.own, false);
  assertEquals(made, []);
});

// new OpenAIClient("") reads OPENAI_API_KEY instead, which would spend the
// server's credit with the quotas switched off.
Deno.test("an empty key counts as no key", async () => {
  const { deps: d, made } = deps("");

  const chosen = await openAIFor("jwt-user", d);

  assertStrictEquals(chosen.client, SERVER);
  assertEquals(chosen.own, false);
  assertEquals(made, []);
});
