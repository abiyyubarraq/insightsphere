import { assert, assertEquals } from "@std/assert";
import { SUMMARY_INPUT_MAX_CHARS } from "./constants.ts";
import {
  buildSummaryInput,
  buildSummaryRequest,
  documentRefusal,
  OMITTED_MARKER,
  pagesRefusal,
} from "./summaryInput.ts";

/** A page of about `length` characters that names its own number. */
const page = (n: number, length: number) =>
  `[page ${n}] ` + "lorem ipsum ".repeat(Math.ceil(length / 12)).slice(0, length);

// A short note was cut or marked as excerpts, and the model said it had only
// seen part of a document it had read whole.
Deno.test("a short document is sent whole and not marked as sampled", () => {
  const out = buildSummaryInput(["First page.", "Second page."]);

  assertEquals(out, { text: "First page.\n\nSecond page.", sampled: false });
});

// A 1000-page document would have blown the context of the summary call.
Deno.test("a 1000-page document is sampled under the cap, from start to end", () => {
  const pages = Array.from({ length: 1000 }, (_, i) => page(i + 1, 2000));

  const out = buildSummaryInput(pages);

  assert(out.sampled);
  assert(out.text.length <= SUMMARY_INPUT_MAX_CHARS, `${out.text.length} chars`);
  const head = Math.floor(SUMMARY_INPUT_MAX_CHARS / 4);
  assertEquals(out.text.slice(0, head), pages.join("\n\n").slice(0, head));
  assert(out.text.startsWith("[page 1] "));
  const seen = [...out.text.matchAll(/\[page (\d+)\]/g)].map((m) => Number(m[1]));
  assert(seen.some((n) => n >= 400 && n <= 600), `middle pages: ${seen}`);
  assert(seen.includes(1000));
  assert(out.text.includes(OMITTED_MARKER));
});

// One 16 MB TXT file is a single page. Sampling by page would have sent its
// first 48k characters and called that the whole document.
Deno.test("one huge page is sampled too, including its end", () => {
  const huge = "start " + "x".repeat(500_000) + " middle " + "y".repeat(500_000) + " the end";

  const out = buildSummaryInput([huge]);

  assert(out.sampled);
  assert(out.text.length <= SUMMARY_INPUT_MAX_CHARS);
  assert(out.text.startsWith("start "));
  assert(out.text.endsWith(" the end"));
});

// A document with no text must not reach the model as an empty prompt.
Deno.test("no pages or only blank pages give empty text", () => {
  assertEquals(buildSummaryInput([]), { text: "", sampled: false });
  assertEquals(buildSummaryInput(["  ", "\n"]), { text: "", sampled: false });
});

// Text just over the cap must still keep every marker true: each one stands
// for text that was really left out, and nothing is sent twice.
Deno.test("text just over the cap leaves something out at every marker", () => {
  const full = Array.from({ length: 600 }, (_, i) => String(i)).join(",");
  const cap = full.length - 1;

  const out = buildSummaryInput([full], cap);

  assert(out.sampled);
  assert(out.text.length <= cap);
  const parts = out.text.split(OMITTED_MARKER);
  let cursor = 0;
  for (const part of parts) {
    const at = full.indexOf(part, cursor);
    assert(at >= cursor, "parts come in order");
    if (cursor > 0) assert(at > cursor, "a gap before every window");
    cursor = at + part.length;
  }
});

// The summary uploaded the original file, and OpenAI accepts only PDF there,
// so every DOCX, TXT and Markdown summary failed with a 500.
Deno.test("the summary request has text only, no file part", () => {
  const request = buildSummaryRequest({ text: "Body text.", sampled: false });

  for (const message of request.messages) {
    assertEquals(typeof message.content, "string");
  }
  assert(JSON.stringify(request.messages).includes("Body text."));
  assert(!JSON.stringify(request.messages).includes("file_id"));
});

// Without this the model wrote as if it had read all of a sampled document.
Deno.test("a sampled input tells the model it has excerpts", () => {
  const whole = buildSummaryRequest({ text: "t", sampled: false });
  const sampled = buildSummaryRequest({ text: "t", sampled: true });

  assert(!String(whole.messages[1].content).includes("excerpts"));
  assert(String(sampled.messages[1].content).includes("excerpts"));
});

// An odd file used to reach OpenAI and come back as a 500.
Deno.test("an unsupported file type is refused with a 400", () => {
  assertEquals(documentRefusal({ status: "ready", file_name: "slides.pptx" }), {
    status: 400,
    error: "This file type cannot be summarized.",
  });
  assertEquals(documentRefusal({ status: "ready", file_name: "no-extension" })?.status, 400);
});

// A document still processing has no stored pages yet; a summary of nothing
// would be saved as if it were real.
Deno.test("a document that is not ready is refused with a 409", () => {
  assertEquals(documentRefusal({ status: "processing", file_name: "notes.md" }), {
    status: 409,
    error: "This document is still being processed.",
  });
});

Deno.test("every supported type that is ready is accepted", () => {
  for (const name of ["a.pdf", "b.DOCX", "c.txt", "d.md"]) {
    assertEquals(documentRefusal({ status: "ready", file_name: name }), null);
  }
});

// Page storage can fail while processing goes on; the user needs a way out.
Deno.test("no stored pages and blank pages are refused before any charge", () => {
  assertEquals(pagesRefusal([]), {
    status: 409,
    error: "This document has no extracted text. Process it again.",
  });
  assertEquals(pagesRefusal(["", "  \n"]), {
    status: 400,
    error: "This document has no text to summarize.",
  });
  assertEquals(pagesRefusal(["", "text"]), null);
});
