package handlers

import (
	"archive/zip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// writeDocx builds a real .docx: a zip whose word/document.xml holds the body.
func writeDocx(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "test.docx")
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()

	zw := zip.NewWriter(f)
	w, err := zw.Create(docxBodyPath)
	if err != nil {
		t.Fatal(err)
	}
	header := `<?xml version="1.0" encoding="UTF-8"?>` +
		`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`
	if _, err := w.Write([]byte(header + body + `</w:body></w:document>`)); err != nil {
		t.Fatal(err)
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	return path
}

func para(runs ...string) string {
	var b strings.Builder
	b.WriteString("<w:p>")
	for _, r := range runs {
		b.WriteString("<w:r><w:t>" + r + "</w:t></w:r>")
	}
	b.WriteString("</w:p>")
	return b.String()
}

func TestParseDOCXExtractsParagraphs(t *testing.T) {
	path := writeDocx(t, para("First paragraph.")+para("Second paragraph."))

	pages, meta, err := ParseDOCX(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(pages) != 1 {
		t.Fatalf("got %d pages, want 1 — docx records no page breaks", len(pages))
	}
	if !strings.Contains(pages[0].Text, "First paragraph.") ||
		!strings.Contains(pages[0].Text, "Second paragraph.") {
		t.Errorf("missing text: %q", pages[0].Text)
	}
	// Paragraphs must stay on separate lines, or chunking runs them together.
	if !strings.Contains(pages[0].Text, "First paragraph.\nSecond paragraph.") {
		t.Errorf("paragraphs not separated: %q", pages[0].Text)
	}
	if meta["fileType"] != "docx" {
		t.Errorf("fileType = %v, want docx", meta["fileType"])
	}
	if meta["successfulPages"] != 1 {
		t.Errorf("successfulPages = %v, want 1", meta["successfulPages"])
	}
}

func TestParseDOCXJoinsRunsWithinAParagraph(t *testing.T) {
	// Word splits a sentence across runs whenever formatting changes; they must
	// rejoin without a space appearing mid-word.
	path := writeDocx(t, para("Insight", "Sphere", " works"))
	pages, _, err := ParseDOCX(path)
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.TrimSpace(pages[0].Text); got != "InsightSphere works" {
		t.Errorf("got %q, want %q", got, "InsightSphere works")
	}
}

func TestParseDOCXSkipsTrackedDeletions(t *testing.T) {
	body := `<w:p><w:r><w:t>kept</w:t></w:r>` +
		`<w:del><w:r><w:delText> removed</w:delText></w:r></w:del></w:p>`
	pages, _, err := ParseDOCX(writeDocx(t, body))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(pages[0].Text, "removed") {
		t.Errorf("deleted text leaked into output: %q", pages[0].Text)
	}
	if !strings.Contains(pages[0].Text, "kept") {
		t.Errorf("kept text missing: %q", pages[0].Text)
	}
}

func TestParseDOCXSeparatesTableCells(t *testing.T) {
	body := `<w:tbl><w:tr><w:tc>` + para("Alpha") + `</w:tc><w:tc>` + para("Beta") + `</w:tc></w:tr></w:tbl>`
	pages, _, err := ParseDOCX(writeDocx(t, body))
	if err != nil {
		t.Fatal(err)
	}
	// Columns must not be concatenated into one token.
	if strings.Contains(pages[0].Text, "AlphaBeta") {
		t.Errorf("cells ran together: %q", pages[0].Text)
	}
	for _, want := range []string{"Alpha", "Beta"} {
		if !strings.Contains(pages[0].Text, want) {
			t.Errorf("missing %q in %q", want, pages[0].Text)
		}
	}
}

func TestParseDOCXKeepsNonASCII(t *testing.T) {
	path := writeDocx(t, para("kelapa sawit ±3,5%"))
	pages, _, err := ParseDOCX(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(pages[0].Text, "±3,5%") {
		t.Errorf("non-ascii lost: %q", pages[0].Text)
	}
}

func TestParseDOCXRejectsUnusableFiles(t *testing.T) {
	dir := t.TempDir()

	notZip := filepath.Join(dir, "fake.docx")
	if err := os.WriteFile(notZip, []byte("this is not a zip"), 0o600); err != nil {
		t.Fatal(err)
	}

	// A valid zip with no word/document.xml: typically a .doc renamed.
	noBody := filepath.Join(dir, "nobody.docx")
	f, err := os.Create(noBody)
	if err != nil {
		t.Fatal(err)
	}
	zw := zip.NewWriter(f)
	if _, err := zw.Create("other.xml"); err != nil {
		t.Fatal(err)
	}
	zw.Close()
	f.Close()

	cases := []struct {
		name    string
		path    string
		wantErr string
	}{
		{"not a zip", notZip, "not a readable docx"},
		{"missing body", noBody, "missing word/document.xml"},
		{"missing file", filepath.Join(dir, "gone.docx"), "not a readable docx"},
		{"no text at all", writeDocx(t, para("")), "no text found"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, _, err := ParseDOCX(c.path)
			if err == nil {
				t.Fatalf("expected an error containing %q", c.wantErr)
			}
			if !strings.Contains(err.Error(), c.wantErr) {
				t.Errorf("error %q does not contain %q", err, c.wantErr)
			}
		})
	}
}
