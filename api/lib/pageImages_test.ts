import { assertEquals } from "@std/assert";
import { uploadPageImages, withMissingPageImages } from "./pageImages.ts";

const BYTES = new Uint8Array([1, 2, 3]);

function storage(failUploadOn: number[] = [], failReadOn: string[] = []) {
  const uploaded: number[] = [];
  return {
    uploaded,
    readFile: (tempPath: string) =>
      failReadOn.includes(tempPath)
        ? Promise.reject(new Error(`No such file: ${tempPath}`))
        : Promise.resolve(BYTES),
    upload: (pageNumber: number, _data: Uint8Array) => {
      if (failUploadOn.includes(pageNumber)) return Promise.reject(new Error("Failed to upload file: timeout"));
      uploaded.push(pageNumber);
      return Promise.resolve(`u/p/images/d/page-${pageNumber}.png`);
    },
  };
}

const THREE_PAGES = { "1": "/tmp/x/page-1.png", "2": "/tmp/x/page-2.png", "3": "/tmp/x/page-3.png" };

// A failed page image upload was only logged, and nothing on the document said
// that page had no preview.
Deno.test("a failed upload is recorded as missing and the other pages keep their paths", async () => {
  const s = storage([2]);
  const result = await uploadPageImages(THREE_PAGES, s.readFile, s.upload);
  assertEquals(result.paths, {
    1: "u/p/images/d/page-1.png",
    3: "u/p/images/d/page-3.png",
  });
  assertEquals(result.missing, [2]);
});

// A temp file the parser did not leave behind is the same loss as a failed upload.
Deno.test("a failed file read counts as a missing page", async () => {
  const s = storage([], ["/tmp/x/page-3.png"]);
  const result = await uploadPageImages(THREE_PAGES, s.readFile, s.upload);
  assertEquals(result.missing, [3]);
  assertEquals(s.uploaded, [1, 2]);
});

// The missing list is read by page number, so it must not depend on upload order.
Deno.test("missing pages are sorted ascending", async () => {
  const s = storage([10, 2]);
  const result = await uploadPageImages(
    { "10": "/tmp/x/page-10.png", "2": "/tmp/x/page-2.png", "1": "/tmp/x/page-1.png" },
    s.readFile,
    s.upload,
  );
  assertEquals(result.missing, [2, 10]);
});

// The normal path: every page uploads and nothing is reported missing.
Deno.test("all uploads succeed and nothing is missing", async () => {
  const s = storage();
  const result = await uploadPageImages(THREE_PAGES, s.readFile, s.upload);
  assertEquals(result.missing, []);
  assertEquals(Object.keys(result.paths).length, 3);
});

// The success path spreads the old metadata, so a key from a failed earlier
// run would stay after every image uploaded.
Deno.test("a fully successful reprocess clears an old missing_page_images key", () => {
  const metadata = withMissingPageImages({ chunkCount: 4, missing_page_images: [2] }, []);
  assertEquals(metadata, { chunkCount: 4 });
  assertEquals("missing_page_images" in metadata, false);
});

// A document with every image has no key at all, not an empty list.
Deno.test("the key is left out when no page is missing", () => {
  assertEquals(withMissingPageImages({ chunkCount: 4 }, []), { chunkCount: 4 });
});

// The key is set when pages are missing, replacing an older list.
Deno.test("the key holds the pages missing in this run", () => {
  assertEquals(
    withMissingPageImages({ chunkCount: 4, missing_page_images: [5] }, [2]),
    { chunkCount: 4, missing_page_images: [2] },
  );
});
