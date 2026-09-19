package utils

import (
	"context"
	"fmt"
	"log"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

func GetPDFPageCount(pdfPath string) (int, error) {
	cmd := exec.Command("pdfinfo", pdfPath)
	output, err := cmd.Output()
	if err != nil {
		return 0, fmt.Errorf("pdfinfo failed: %w", err)
	}

	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "Pages:") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				count, err := strconv.Atoi(parts[1])
				if err != nil {
					return 0, fmt.Errorf("failed to parse page count: %w", err)
				}
				return count, nil
			}
		}
	}

	return 0, fmt.Errorf("could not find page count in pdfinfo output")
}

func ConvertSinglePageToGrayPNG(ctx context.Context, pdfPath string, pageNum int, outputDir string) (string, time.Duration, error) {
	startTime := time.Now()

	outputFile := filepath.Join(outputDir, fmt.Sprintf("page-%03d.png", pageNum))

	// -gray was documented here but never passed, so pages rendered in colour at
	// roughly three times the bytes for no gain in OCR accuracy.
	cmd := exec.CommandContext(ctx, "pdftoppm",
		"-f", strconv.Itoa(pageNum),
		"-l", strconv.Itoa(pageNum),
		"-png",
		"-gray",
		"-r", strconv.Itoa(OCRDPI()),
		"-singlefile",
		pdfPath,
		strings.TrimSuffix(outputFile, ".png"),
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", 0, fmt.Errorf("pdftoppm failed for page %d: %w (output: %s)", pageNum, err, string(output))
	}

	duration := time.Since(startTime)
	return outputFile, duration, nil
}

func ConvertPDFToGrayPNGImages(ctx context.Context, pdfPath, outputDir string) ([]string, error) {
	log.Printf("🖼️ Converting PDF to grayscale PNG images (300 DPI)...")
	startTime := time.Now()

	outputPrefix := filepath.Join(outputDir, "page")

	cmd := exec.CommandContext(ctx, "pdftoppm",
		"-png",
		"-gray",
		"-r", strconv.Itoa(OCRDPI()),
		"-cropbox",
		pdfPath,
		outputPrefix,
	)

	log.Printf("🔧 Running command: %s", strings.Join(cmd.Args, " "))

	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("❌ pdftoppm failed: %v", err)
		log.Printf("📝 Command output: %s", string(output))
		return nil, fmt.Errorf("pdftoppm failed: %w (output: %s)", err, string(output))
	}

	duration := time.Since(startTime)
	log.Printf("✅ pdftoppm completed in %v", duration)

	pattern := filepath.Join(outputDir, "page-*.png")
	imageFiles, err := filepath.Glob(pattern)
	if err != nil {
		return nil, fmt.Errorf("failed to find generated images: %w", err)
	}

	if len(imageFiles) == 0 {
		return nil, fmt.Errorf("no images were generated from PDF")
	}

	log.Printf("📁 Found %d grayscale PNG files", len(imageFiles))
	return imageFiles, nil
}
