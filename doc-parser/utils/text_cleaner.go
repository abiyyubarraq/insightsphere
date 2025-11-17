package utils

import "strings"

// CleanOCRText removes excessive whitespace and normalizes OCR text
func CleanOCRText(text string) string {
	// Remove excessive whitespace
	text = strings.TrimSpace(text)

	// Replace multiple spaces with single space
	text = strings.ReplaceAll(text, "  ", " ")

	// Replace multiple newlines with double newline
	lines := strings.Split(text, "\n")
	var cleanLines []string

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if len(line) > 0 {
			cleanLines = append(cleanLines, line)
		}
	}

	return strings.Join(cleanLines, "\n")
}

