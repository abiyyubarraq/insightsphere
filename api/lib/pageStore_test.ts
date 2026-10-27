import { assertEquals, assertRejects } from "@std/assert";
import {
  lastPageToKeep,
  type PageStore,
  type ParsedPage,
  persistDocumentPages,
  readAllPages,
} from "./pageStore.ts";

function pages(count: number): ParsedPage[] {
  return Array.from({ length: count }, (_, i) => ({ page_number: i + 1, text: `page ${i + 1}` }));
}

/** An in-memory document_pages table, keyed by document and page. */
function table(failUpsert = false, failDelete = false) {
  const rows = new Map<string, Map<number, string>>();
  const calls: string[] = [];
  const store: PageStore = {
    storeDocumentPages: (documentId, newPages) => {
      calls.push("upsert");
      if (failUpsert) return Promise.reject(new Error("Failed to store document pages: timeout"));
      const doc = rows.get(documentId) ?? new Map<number, string>();
      for (const page of newPages) doc.set(page.page_number, page.text);
      rows.set(documentId, doc);
      return Promise.resolve();
    },
    deleteDocumentPagesAbove: (documentId, lastPage) => {
      calls.push(`delete>${lastPage}`);
      if (failDelete) return Promise.reject(new Error("Failed to remove old document pages: timeout"));
      const doc = rows.get(documentId);
      for (const n of [...(doc?.keys() ?? [])]) if (n > lastPage) doc!.delete(n);
      return Promise.resolve();
    },
  };
  const pageNumbers = (documentId: string) => [...(rows.get(documentId)?.keys() ?? [])].sort((a, b) => a - b);
  return { store, calls, pageNumbers };
}

// A document processed again with fewer pages kept its old pages, and their
// text went into the summary.
Deno.test("processing 3 pages after 10 removes pages 4 to 10", async () => {
  const t = table();

  await persistDocumentPages(t.store, "doc", pages(10));
  await persistDocumentPages(t.store, "doc", pages(3));

  assertEquals(t.pageNumbers("doc"), [1, 2, 3]);
  assertEquals(t.calls, ["upsert", "delete>10", "upsert", "delete>3"]);
});

Deno.test("processing the same page count again keeps every page", async () => {
  const t = table();

  await persistDocumentPages(t.store, "doc", pages(4));
  await persistDocumentPages(t.store, "doc", pages(4));

  assertEquals(t.pageNumbers("doc"), [1, 2, 3, 4]);
});

// The delete is scoped by document_id; one document's result must not touch another's rows.
Deno.test("a shorter result for one document leaves other documents alone", async () => {
  const t = table();

  await persistDocumentPages(t.store, "a", pages(5));
  await persistDocumentPages(t.store, "b", pages(5));
  await persistDocumentPages(t.store, "a", pages(1));

  assertEquals(t.pageNumbers("a"), [1]);
  assertEquals(t.pageNumbers("b"), [1, 2, 3, 4, 5]);
});

Deno.test("an empty result deletes nothing", async () => {
  const t = table();

  await persistDocumentPages(t.store, "doc", pages(3));
  await persistDocumentPages(t.store, "doc", []);

  assertEquals(lastPageToKeep([]), null);
  assertEquals(t.calls, ["upsert", "delete>3", "upsert"]);
  assertEquals(t.pageNumbers("doc"), [1, 2, 3]);
});

Deno.test("the page to keep is the highest page number, not the count", () => {
  assertEquals(lastPageToKeep([{ page_number: 2, text: "" }, { page_number: 7, text: "" }]), 7);
});

// A failed page store was logged and skipped, and the document still ended
// ready with no stored pages, so its summary had nothing to read.
Deno.test("a failed upsert rejects and deletes nothing", async () => {
  const t = table(true);

  await assertRejects(
    () => persistDocumentPages(t.store, "doc", pages(3)),
    Error,
    "Failed to store document pages",
  );

  assertEquals(t.calls, ["upsert"]);
});

Deno.test("a failed delete rejects", async () => {
  const t = table(false, true);

  await assertRejects(
    () => persistDocumentPages(t.store, "doc", pages(3)),
    Error,
    "Failed to remove old document pages",
  );
});

function source(total: number) {
  const reads: Array<[number, number]> = [];
  const rows = Array.from({ length: total }, (_, i) => i + 1);
  const readRange = (from: number, to: number) => {
    reads.push([from, to]);
    return Promise.resolve(rows.slice(from, to + 1));
  };
  return { readRange, reads };
}

// Supabase returns at most 1000 rows per request, so a longer document lost
// every page after the thousandth without any error.
Deno.test("2500 rows are read in 3 reads, all of them, in order", async () => {
  const s = source(2500);

  const rows = await readAllPages(s.readRange);

  assertEquals(s.reads, [[0, 999], [1000, 1999], [2000, 2999]]);
  assertEquals(rows.length, 2500);
  assertEquals(rows[0], 1);
  assertEquals(rows[2499], 2500);
  assertEquals(rows.every((n, i) => n === i + 1), true);
});

Deno.test("exactly 1000 rows need a second, empty read", async () => {
  const s = source(1000);

  const rows = await readAllPages(s.readRange);

  assertEquals(s.reads, [[0, 999], [1000, 1999]]);
  assertEquals(rows.length, 1000);
});

Deno.test("no rows is one read", async () => {
  const s = source(0);

  assertEquals(await readAllPages(s.readRange), []);
  assertEquals(s.reads, [[0, 999]]);
});

// A failed read must not look like a document with fewer pages.
Deno.test("a read error throws", async () => {
  let calls = 0;
  const readRange = () => {
    calls++;
    return calls === 1
      ? Promise.resolve(Array.from({ length: 1000 }, () => "x"))
      : Promise.reject(new Error("Failed to read document pages: timeout"));
  };

  await assertRejects(() => readAllPages(readRange), Error, "Failed to read document pages");
});
