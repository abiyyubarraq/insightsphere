package utils

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidatePDFFile(t *testing.T) {
	dir := t.TempDir()

	good := filepath.Join(dir, "doc.pdf")
	if err := os.WriteFile(good, []byte("%PDF-1.4\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	empty := filepath.Join(dir, "empty.pdf")
	if err := os.WriteFile(empty, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	wrongExt := filepath.Join(dir, "doc.txt")
	if err := os.WriteFile(wrongExt, []byte("hello"), 0o600); err != nil {
		t.Fatal(err)
	}
	upperExt := filepath.Join(dir, "DOC.PDF")
	if err := os.WriteFile(upperExt, []byte("%PDF-1.4\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		name    string
		path    string
		wantErr string
	}{
		{"accepts a pdf", good, ""},
		{"accepts uppercase extension", upperExt, ""},
		{"rejects a missing file", filepath.Join(dir, "nope.pdf"), "file not found"},
		{"rejects an empty file", empty, "file is empty"},
		{"rejects a non-pdf extension", wrongExt, "not a PDF"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := ValidatePDFFile(c.path)
			if c.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("expected an error containing %q, got nil", c.wantErr)
			}
			if !strings.Contains(err.Error(), c.wantErr) {
				t.Errorf("error %q does not contain %q", err, c.wantErr)
			}
		})
	}
}

func TestGetFileSize(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "x.pdf")
	if err := os.WriteFile(p, []byte("0123456789"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := GetFileSize(p); got != 10 {
		t.Errorf("got %d, want 10", got)
	}
	if got := GetFileSize(filepath.Join(dir, "missing")); got != 0 {
		t.Errorf("missing file gave %d, want 0", got)
	}
}
