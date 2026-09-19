package handlers

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

// Plain text is embedded directly, so an oversized file turns into a very large
// number of chunks rather than failing fast. Cap it here.
const maxTextBytes = 16 << 20

// ParseText reads a .txt or .md file.
//
// There is nothing to extract: the bytes are already the text. Markdown is left
// as written rather than stripped, because its structure carries meaning —
// "## Results" is a better chunk boundary and a better embedding than "Results"
// floating on its own.
//
// Like DOCX, plain text has no pages, so it comes back as a single PageData.
func ParseText(filePath string) ([]PageData, map[string]interface{}, error) {
	name := filepath.Base(filePath)

	info, err := os.Stat(filePath)
	if err != nil {
		return nil, nil, fmt.Errorf("file not found: %s", name)
	}
	if info.Size() == 0 {
		return nil, nil, fmt.Errorf("%s is empty", name)
	}
	if info.Size() > maxTextBytes {
		return nil, nil, fmt.Errorf("%s is %d bytes, over the %d limit", name, info.Size(), maxTextBytes)
	}

	raw, err := os.ReadFile(filePath)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read %s: %w", name, err)
	}

	// A binary file renamed to .txt would otherwise be embedded as noise.
	if !utf8.Valid(raw) {
		return nil, nil, fmt.Errorf("%s is not valid UTF-8; it may be a binary file or use a different encoding", name)
	}

	// Editors on Windows write CRLF, and a stray \r inside a chunk is noise in
	// the embedding and in any snippet shown to the user.
	text := strings.ReplaceAll(string(raw), "\r\n", "\n")
	text = strings.TrimSpace(strings.TrimPrefix(text, "\uFEFF"))

	if text == "" {
		return nil, nil, fmt.Errorf("%s contains only whitespace", name)
	}

	format := "txt"
	if ext := strings.ToLower(filepath.Ext(filePath)); ext == ".md" || ext == ".markdown" {
		format = "md"
	}

	pages := []PageData{{PageNumber: 1, Text: text}}
	meta := map[string]interface{}{
		"fileName":         name,
		"fileType":         format,
		"pages":            1,
		"successfulPages":  1,
		"failedPages":      0,
		"extractionMethod": "plain-text",
		"textLength":       len(text),
		"pagination":       "none; plain text has no page breaks",
	}
	return pages, meta, nil
}
