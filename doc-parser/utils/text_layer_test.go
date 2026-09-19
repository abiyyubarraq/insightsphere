package utils

import "testing"

// A PDF that carries its own text was still being rendered to an image and read
// back with OCR: 136 seconds and OCR errors to recover 44,128 characters that
// pdftotext returns exactly, in under a millisecond. These pin the decision of
// when the embedded text is good enough to use instead.
func TestHasUsableText(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want bool
	}{
		{
			"a real paragraph",
			"The patient presented with irritant contact dermatitis on both hands.",
			true,
		},
		{"empty", "", false},
		{"only whitespace", "   \n\t \n", false},
		// What a scanned page usually leaves in its text layer. The body of the
		// page exists only in the image, so these must still go to OCR.
		{"page number only", "7", false},
		{"short running header", "J. Med. 2025", false},
		{"a DOI with few letters", "10.1234/5678-9012.3456", false},
		{"long but almost no letters", "1234567890 ... 0987654321 --- 111 222", false},
		// Indonesian and other non-ASCII text counts as letters.
		{"indonesian prose", "Dermatitis kontak iritan dengan infeksi sekunder bakteri", true},
		{"japanese prose", "これは日本語のテキストで、十分な長さがあります", true},
		{"accented prose", "Émile étudie la dermatite de contact irritative aujourd'hui", true},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := HasUsableText(c.in); got != c.want {
				t.Errorf("HasUsableText(%q) = %v, want %v", c.in, got, c.want)
			}
		})
	}
}

func TestHasUsableTextBoundaries(t *testing.T) {
	// Twenty runes and ten letters is the floor; one short of either fails.
	atFloor := "abcdefghij0123456789"
	if len([]rune(atFloor)) != minTextLayerRunes {
		t.Fatalf("fixture is %d runes, expected %d", len([]rune(atFloor)), minTextLayerRunes)
	}
	if !HasUsableText(atFloor) {
		t.Errorf("HasUsableText(%q) = false at the floor, want true", atFloor)
	}

	tooShort := "abcdefghij012345678"
	if HasUsableText(tooShort) {
		t.Errorf("HasUsableText(%q) = true one rune below the floor, want false", tooShort)
	}

	tooFewLetters := "abcdefghi 0123456789 0"
	if HasUsableText(tooFewLetters) {
		t.Errorf("HasUsableText(%q) = true with nine letters, want false", tooFewLetters)
	}
}

// pdftotext writes a form feed after every page, including the last, so a naive
// split leaves a trailing empty entry. Numbering must stay 1-based and aligned
// with the PDF, or a page's text ends up attached to the wrong page image.
func TestSplitTextLayerPages(t *testing.T) {
	pages := splitTextLayerPages("first page\fsecond page\fthird page\f")

	if len(pages) != 3 {
		t.Fatalf("got %d pages, want 3: %v", len(pages), pages)
	}
	for n, want := range map[int]string{1: "first page", 2: "second page", 3: "third page"} {
		if pages[n] != want {
			t.Errorf("page %d = %q, want %q", n, pages[n], want)
		}
	}
}

func TestSplitTextLayerPagesSkipsEmptyPages(t *testing.T) {
	// A scanned page inside a digital document contributes nothing here, and
	// the pages after it must keep their real numbers.
	pages := splitTextLayerPages("first\f\fthird\f")

	if _, ok := pages[2]; ok {
		t.Errorf("empty page 2 should be absent, got %q", pages[2])
	}
	if pages[3] != "third" {
		t.Errorf("page 3 = %q, want %q — numbering shifted", pages[3], "third")
	}
}

func TestSplitTextLayerPagesOnEmptyOutput(t *testing.T) {
	if got := splitTextLayerPages(""); len(got) != 0 {
		t.Errorf("empty output produced %v, want no pages", got)
	}
}
