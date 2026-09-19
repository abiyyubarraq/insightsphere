package utils

import (
	"os"
	"strconv"
)

// Rendering and OCR settings. Previously these were literals scattered across
// the converter and the OCR call, and the metadata reported values that did not
// match what was actually run.
const (
	defaultDPI       = 300
	defaultLanguages = "eng"
)

// OCRDPI is the resolution pdftoppm renders at. Tesseract gains nothing above
// roughly 300, and every extra pixel is CPU time plus storage, since the PNGs
// are uploaded and kept for page previews.
func OCRDPI() int {
	if raw := os.Getenv("OCR_DPI"); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v >= 72 && v <= 600 {
			return v
		}
	}
	return defaultDPI
}

// OCRLanguages is passed to tesseract's -l flag. Combine with '+', e.g.
// "eng+ind". Each language needs its traineddata present in the image.
func OCRLanguages() string {
	if raw := os.Getenv("OCR_LANGUAGES"); raw != "" {
		return raw
	}
	return defaultLanguages
}
