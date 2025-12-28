package utils

import "strings"

func CleanOCRText(text string) string {
	text = strings.TrimSpace(text)

	text = strings.ReplaceAll(text, "  ", " ")

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

