package utils

import "testing"

func TestCleanOCRText(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"trims surrounding space", "  hello  ", "hello"},
		{"drops blank lines", "a\n\n\nb", "a\nb"},
		{"trims each line", "  a  \n  b  ", "a\nb"},
		{"collapses double spaces", "a  b", "a b"},
		{"empty input", "", ""},
		{"only whitespace", "  \n \n ", ""},
		// Tesseract emits plenty of these; they must survive untouched.
		{"keeps single spaces", "the quick brown fox", "the quick brown fox"},
		{"keeps punctuation", "Fig. 1: results (n=42).", "Fig. 1: results (n=42)."},
		{"keeps non-ascii", "kelapa sawit — ±3,5%", "kelapa sawit — ±3,5%"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := CleanOCRText(c.in); got != c.want {
				t.Errorf("CleanOCRText(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}
