package handlers

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeFile(t *testing.T, name string, content []byte) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(p, content, 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestParseTextReadsPlainText(t *testing.T) {
	pages, meta, err := ParseText(writeFile(t, "notes.txt", []byte("line one\nline two\n")))
	if err != nil {
		t.Fatal(err)
	}
	if len(pages) != 1 {
		t.Fatalf("got %d pages, want 1", len(pages))
	}
	if pages[0].Text != "line one\nline two" {
		t.Errorf("got %q", pages[0].Text)
	}
	if meta["fileType"] != "txt" {
		t.Errorf("fileType = %v, want txt", meta["fileType"])
	}
}

func TestParseTextKeepsMarkdownStructure(t *testing.T) {
	// Headings are left in place: they make better chunk boundaries and carry
	// meaning into the embedding.
	md := "# Title\n\n## Results\n\nThe value was 42.\n"
	pages, meta, err := ParseText(writeFile(t, "doc.md", []byte(md)))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(pages[0].Text, "## Results") {
		t.Errorf("markdown structure lost: %q", pages[0].Text)
	}
	if meta["fileType"] != "md" {
		t.Errorf("fileType = %v, want md", meta["fileType"])
	}
}

func TestParseTextNormalisesLineEndingsAndBOM(t *testing.T) {
	pages, _, err := ParseText(writeFile(t, "win.txt", []byte("\ufeffalpha\r\nbeta\r\n")))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(pages[0].Text, "\r") {
		t.Errorf("carriage returns survived: %q", pages[0].Text)
	}
	if strings.HasPrefix(pages[0].Text, "\ufeff") {
		t.Errorf("BOM survived: %q", pages[0].Text)
	}
	if pages[0].Text != "alpha\nbeta" {
		t.Errorf("got %q", pages[0].Text)
	}
}

func TestParseTextKeepsNonASCII(t *testing.T) {
	pages, _, err := ParseText(writeFile(t, "id.txt", []byte("kelapa sawit ±3,5%")))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(pages[0].Text, "±3,5%") {
		t.Errorf("non-ascii lost: %q", pages[0].Text)
	}
}

func TestParseTextRejectsUnusableFiles(t *testing.T) {
	cases := []struct {
		name    string
		file    string
		content []byte
		wantErr string
	}{
		{"empty", "empty.txt", []byte(""), "is empty"},
		{"whitespace only", "ws.txt", []byte("  \n\n \t "), "only whitespace"},
		// A renamed binary would otherwise be embedded as noise.
		{"not utf-8", "bin.txt", []byte{0xff, 0xfe, 0x00, 0x01, 0xc3, 0x28}, "not valid UTF-8"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, _, err := ParseText(writeFile(t, c.file, c.content))
			if err == nil {
				t.Fatalf("expected error containing %q", c.wantErr)
			}
			if !strings.Contains(err.Error(), c.wantErr) {
				t.Errorf("error %q does not contain %q", err, c.wantErr)
			}
		})
	}

	if _, _, err := ParseText(filepath.Join(t.TempDir(), "gone.txt")); err == nil {
		t.Error("expected an error for a missing file")
	}
}
