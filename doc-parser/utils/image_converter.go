package utils

import (
	"context"
	"fmt"
	"log"
	"os/exec"
	"path/filepath"
	"strings"
)

// ConvertPDFToPNGImages converts PDF to PNG images at 300 DPI for OCR processing
func ConvertPDFToPNGImages(ctx context.Context, pdfPath, outputDir string) ([]string, error) {
	log.Printf("🖼️ Converting PDF to PNG images using poppler-utils...")

	// Use pdftoppm to convert PDF to PNG images
	// -png: output as PNG format
	// -r 300: 300 DPI for good OCR quality
	// -cropbox: use crop box instead of media box
	outputPrefix := filepath.Join(outputDir, "page")

	cmd := exec.CommandContext(ctx, "pdftoppm",
		"-png",      // PNG format
		"-r", "300", // 300 DPI for OCR
		"-cropbox",  // Use crop box
		pdfPath,     // Input PDF
		outputPrefix, // Output prefix
	)

	log.Printf("🔧 Running command: %s", strings.Join(cmd.Args, " "))

	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("❌ pdftoppm failed: %v", err)
		log.Printf("📝 Command output: %s", string(output))
		return nil, fmt.Errorf("pdftoppm failed: %w (output: %s)", err, string(output))
	}

	log.Printf("✅ pdftoppm completed successfully")

	// Find all generated image files
	pattern := filepath.Join(outputDir, "page-*.png")
	imageFiles, err := filepath.Glob(pattern)
	if err != nil {
		return nil, fmt.Errorf("failed to find generated images: %w", err)
	}

	if len(imageFiles) == 0 {
		return nil, fmt.Errorf("no images were generated from PDF")
	}

	log.Printf("📁 Found %d image files", len(imageFiles))
	return imageFiles, nil
}

// ConvertPDFToJPEGImages converts PDF to JPEG images at 150 DPI for web display
func ConvertPDFToJPEGImages(ctx context.Context, pdfPath, outputDir string) ([]string, error) {
	log.Printf("🖼️ Converting PDF to JPEG images using poppler-utils (150 DPI)...")

	// Use pdftoppm to convert PDF to JPEG images
	// -jpeg: output as JPEG format
	// -r 150: 150 DPI for web display (smaller file size)
	// -cropbox: use crop box instead of media box
	outputPrefix := filepath.Join(outputDir, "page")

	cmd := exec.CommandContext(ctx, "pdftoppm",
		"-jpeg",     // JPEG format
		"-r", "150", // 150 DPI for web
		"-cropbox",  // Use crop box
		pdfPath,     // Input PDF
		outputPrefix, // Output prefix
	)

	log.Printf("🔧 Running command: %s", strings.Join(cmd.Args, " "))

	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("❌ pdftoppm failed: %v", err)
		log.Printf("📝 Command output: %s", string(output))
		return nil, fmt.Errorf("pdftoppm failed: %w (output: %s)", err, string(output))
	}

	log.Printf("✅ pdftoppm completed successfully")

	// Find all generated image files
	pattern := filepath.Join(outputDir, "page-*.jpg")
	imageFiles, err := filepath.Glob(pattern)
	if err != nil {
		return nil, fmt.Errorf("failed to find generated images: %w", err)
	}

	if len(imageFiles) == 0 {
		return nil, fmt.Errorf("no images were generated from PDF")
	}

	log.Printf("📁 Found %d JPEG image files", len(imageFiles))
	return imageFiles, nil
}

