package utils

import (
	"context"
	"log"
	"os/exec"
	"strings"
	"unicode"
)

// A page needs this much embedded text before it is used in place of OCR.
// A page number or a running header on its own is not enough: those appear on
// scanned pages too, where the body text exists only in the image.
const (
	minTextLayerRunes   = 20
	minTextLayerLetters = 10
)

// ExtractTextLayer reads the text a PDF already carries, one entry per page.
//
// Most PDFs are not scans. They hold their text, and rendering each page to an
// image so tesseract can read it back is both slower and less accurate than
// simply taking it. Measured on a 14 page article: pdftotext returned 44,128
// characters in under a millisecond, where render plus OCR took 136 seconds
// and introduced errors the text layer does not have.
//
// Returns an empty map when the file has no text layer or pdftotext fails.
// Callers fall back to OCR page by page, so this never has to succeed.
func ExtractTextLayer(ctx context.Context, pdfPath string) map[int]string {
	// One invocation for the whole file rather than one per page: pdftotext
	// separates pages with a form feed, which is cheaper than N processes.
	cmd := exec.CommandContext(ctx, "pdftotext", pdfPath, "-")
	out, err := cmd.Output()
	if err != nil {
		log.Printf("⚠️ pdftotext failed, falling back to OCR for every page: %v", err)
		return map[int]string{}
	}

	return splitTextLayerPages(string(out))
}

// splitTextLayerPages turns pdftotext output into one entry per page.
//
// Pages are separated by a form feed, and the last one is followed by a form
// feed too, so a trailing empty entry is normal and must not shift the
// numbering. A page with nothing on it is left out rather than stored as "",
// so a caller can tell "no text on this page" from "no such page".
func splitTextLayerPages(out string) map[int]string {
	pages := make(map[int]string)
	for i, page := range strings.Split(out, "\f") {
		if text := strings.TrimSpace(page); text != "" {
			pages[i+1] = text
		}
	}
	return pages
}

// HasUsableText decides whether a page's embedded text can stand in for OCR.
//
// The letter count is what separates real text from the stray marks a scanned
// page often carries in its layer — a page number, a DOI, a watermark. It does
// not catch a PDF with a broken ToUnicode map, which yields fluent-looking
// mojibake; that is rare enough to accept, and OCR of such a file is usually no
// better.
func HasUsableText(text string) bool {
	trimmed := strings.TrimSpace(text)
	if len([]rune(trimmed)) < minTextLayerRunes {
		return false
	}

	letters := 0
	for _, r := range trimmed {
		if unicode.IsLetter(r) {
			letters++
			if letters >= minTextLayerLetters {
				return true
			}
		}
	}
	return false
}
