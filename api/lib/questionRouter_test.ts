import { assert, assertEquals } from "@std/assert";
import {
  buildRouterMessages,
  type CompleteRoute,
  parseRoute,
  routeQuestion,
} from "./questionRouter.ts";
import { OpenAIRequestError } from "./openaiErrors.ts";

const files = ["hallucination-survey.pdf", "inoculation.pdf"];

const answering = (answer: string): CompleteRoute => () => Promise.resolve(answer);

/** Runs fn with console output captured, so a test can read every log line. */
async function captureConsole<T>(fn: () => Promise<T>): Promise<{ result: T; lines: string }> {
  const original = { log: console.log, warn: console.warn, error: console.error };
  const lines: string[] = [];
  const keep = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  console.log = keep;
  console.warn = keep;
  console.error = keep;
  try {
    return { result: await fn(), lines: lines.join("\n") };
  } finally {
    Object.assign(console, original);
  }
}

// The model is asked for one word, but it can wrap it in quotes or end it with
// a full stop. Those are still the label.
Deno.test("a label in any case, in quotes or with a full stop is read", () => {
  assertEquals(parseRoute("Overview"), "overview");
  assertEquals(parseRoute('"overview"'), "overview");
  assertEquals(parseRoute("off_topic."), "off_topic");
  assertEquals(parseRoute("  specific \n"), "specific");
});

// Anything looser would let a reply like "overview or specific" pick a path
// the model never chose.
Deno.test("a reply that is not exactly one label is refused", () => {
  for (const raw of ["", "overview please", "Overview or specific", "summary", "off-topic"]) {
    assertEquals(parseRoute(raw), null, raw);
  }
});

// The question and the file names are untrusted text. They go in the user
// message, inside a data block, never in the instructions.
Deno.test("the prompt carries the three labels and puts file names in a data block", () => {
  const [system, user] = buildRouterMessages("what is the point of this?", files);

  for (const label of ["overview", "specific", "off_topic"]) {
    assert(system.content.includes(label), label);
  }
  assert(system.content.includes("When unsure, answer specific."));
  assert(!system.content.includes("inoculation.pdf"));
  assert(user.content.includes("<files>\n- hallucination-survey.pdf\n- inoculation.pdf\n</files>"));
  assert(user.content.includes("what is the point of this?"));
});

Deno.test("a clean label is the route", async () => {
  assertEquals(await routeQuestion("summarize these", files, answering("overview")), {
    route: "overview",
    failed: false,
  });
});

// Every router failure must leave the answer as good as it was before the
// router existed: the normal search path.
Deno.test("a completion that never returns falls back once the deadline passes", async () => {
  const never: CompleteRoute = () => new Promise<string>(() => {});
  assertEquals(await routeQuestion("q", files, never, { timeoutMs: 20 }), {
    route: "specific",
    failed: true,
  });
});

Deno.test("a thrown error falls back, including a rejected key", async () => {
  const plain: CompleteRoute = () => Promise.reject(new Error("502 from upstream"));
  const keyError: CompleteRoute = () =>
    Promise.reject(
      new OpenAIRequestError(
        "Failed to generate chat completion",
        Object.assign(new Error("Incorrect API key provided: sk-abc***wxyz"), { status: 401 }),
      ),
    );

  for (const complete of [plain, keyError]) {
    assertEquals(await routeQuestion("q", files, complete), { route: "specific", failed: true });
  }
});

Deno.test("a bad label falls back", async () => {
  for (const raw of ["", "overview please", "Overview or specific", "banana"]) {
    assertEquals(await routeQuestion("q", files, answering(raw)), {
      route: "specific",
      failed: true,
    }, raw);
  }
});

// Questions and file names are user content and must never reach the logs.
// An OpenAI error message can also repeat part of the key.
Deno.test("the router logs neither the question, a file name nor an error message", async () => {
  const question = "what is the secret plan in my notes";
  for (const complete of [
    answering("overview"),
    answering("nonsense"),
    () => Promise.reject(new Error("Incorrect API key provided: sk-abc***wxyz")),
  ] as CompleteRoute[]) {
    const { lines } = await captureConsole(() => routeQuestion(question, files, complete));
    assert(lines.length > 0);
    assert(!lines.includes(question));
    assert(!lines.includes("inoculation.pdf"));
    assert(!lines.includes("sk-abc"));
  }
});
