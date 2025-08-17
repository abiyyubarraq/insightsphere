package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type ParseRequest struct {
	FilePath string `json:"filePath" binding:"required"`
}

type ParseResponse struct {
	Text  string                 `json:"text"`
	Pages []PageData             `json:"pages"`
	Meta  map[string]interface{} `json:"meta"`
}

type PageData struct {
	PageNumber int    `json:"page_number"`
	Text       string `json:"text"`
}

func main() {
	// Set Gin to release mode in production
	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()

	// Health check endpoint
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "healthy",
			"service":   "doc-parser",
			"timestamp": time.Now().UTC(),
			"version":   "2.0.0-ocr",
		})
	})

	// PDF parsing endpoint - now using OCR
	r.POST("/parse/pdf", func(c *gin.Context) {
		var req ParseRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			log.Printf("❌ Invalid request: %v", err)
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		log.Printf("🚀 Starting OCR-based PDF parsing: %s", req.FilePath)

		// Create context with timeout
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()

		// Parse PDF using OCR
		text, pages, meta, err := parsePDFWithOCR(ctx, req.FilePath)
		if err != nil {
			log.Printf("❌ PDF parsing failed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		log.Printf("✅ PDF parsing completed: %d pages, %d characters", meta["pages"], len(text))

		c.JSON(http.StatusOK, ParseResponse{
			Text:  text,
			Pages: pages,
			Meta:  meta,
		})
	})

	// Get service info
	r.GET("/info", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"service":     "doc-parser",
			"version":     "2.0.0-ocr",
			"methods":     []string{"PDF-to-Image-OCR"},
			"engines":     []string{"poppler-utils", "tesseract-ocr"},
			"formats":     []string{"pdf"},
			"max_timeout": "10 minutes",
		})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("🚀 Document Parser OCR service starting on port %s", port)
	log.Printf("📋 Endpoints:")
	log.Printf("   GET  /health      - Health check")
	log.Printf("   GET  /info        - Service information")
	log.Printf("   POST /parse/pdf   - PDF OCR parsing")
	log.Fatal(r.Run(":" + port))
}

// Main PDF parsing function using OCR approach
func parsePDFWithOCR(ctx context.Context, filePath string) (string, []PageData, map[string]interface{}, error) {
	log.Printf("🔍 Starting OCR-based PDF parsing for: %s", filePath)

	// Validate file
	if err := validatePDFFile(filePath); err != nil {
		return "", nil, nil, fmt.Errorf("file validation failed: %w", err)
	}

	// Create temporary directory for images
	tempDir, err := os.MkdirTemp("", "pdf_ocr_*")
	if err != nil {
		return "", nil, nil, fmt.Errorf("failed to create temp directory: %w", err)
	}
	defer func() {
		log.Printf("🧹 Cleaning up temp directory: %s", tempDir)
		os.RemoveAll(tempDir)
	}()

	log.Printf("📂 Using temp directory: %s", tempDir)

	// Step 1: Convert PDF to images
	imageFiles, err := convertPDFToImages(ctx, filePath, tempDir)
	if err != nil {
		return "", nil, nil, fmt.Errorf("PDF to image conversion failed: %w", err)
	}

	log.Printf("🖼️ Converted PDF to %d image files", len(imageFiles))

	// Step 2: Perform OCR on each image
	var allText strings.Builder
	var pages []PageData
	successfulPages := 0

	for i, imageFile := range imageFiles {
		pageNum := i + 1
		log.Printf("🔍 Processing page %d/%d: %s", pageNum, len(imageFiles), filepath.Base(imageFile))

		// Check context for cancellation
		select {
		case <-ctx.Done():
			return "", nil, nil, fmt.Errorf("processing cancelled: %w", ctx.Err())
		default:
		}

		// Perform OCR on the image
		pageText, err := performOCR(ctx, imageFile)
		if err != nil {
			log.Printf("⚠️ OCR failed for page %d: %v", pageNum, err)
			// Continue with empty text for this page
			pageText = ""
		}

		// Clean and process the text
		cleanText := strings.TrimSpace(pageText)
		pages = append(pages, PageData{
			PageNumber: pageNum,
			Text:       cleanText,
		})

		if len(cleanText) > 0 {
			successfulPages++
			log.Printf("📝 Page %d: extracted %d characters", pageNum, len(cleanText))
			
			// Show preview of extracted text
			preview := cleanText
			if len(preview) > 100 {
				preview = preview[:100] + "..."
			}
			log.Printf("📖 Page %d preview: %q", pageNum, preview)

			allText.WriteString(cleanText)
			allText.WriteString("\n\n")
		} else {
			log.Printf("⚠️ Page %d: no text extracted", pageNum)
		}
	}

	finalText := strings.TrimSpace(allText.String())
	totalPages := len(imageFiles)

	log.Printf("✅ OCR completed: %d/%d pages successful, %d total characters", successfulPages, totalPages, len(finalText))

	// Build metadata
	metadata := map[string]interface{}{
		"fileName":         filepath.Base(filePath),
		"fileType":         "pdf",
		"pages":            totalPages,
		"successfulPages":  successfulPages,
		"size":             getFileSize(filePath),
		"extractionMethod": "ocr",
		"textLength":       len(finalText),
		"ocrEngine":        "tesseract",
		"conversionTool":   "poppler-utils",
	}

	return finalText, pages, metadata, nil
}

// Validate PDF file
func validatePDFFile(filePath string) error {
	// Check if file exists
	fileInfo, err := os.Stat(filePath)
	if os.IsNotExist(err) {
		return fmt.Errorf("file not found: %s", filePath)
	}
	if err != nil {
		return fmt.Errorf("failed to stat file: %w", err)
	}

	// Check file size
	if fileInfo.Size() == 0 {
		return fmt.Errorf("file is empty: %s", filePath)
	}

	// Check file extension
	if !strings.HasSuffix(strings.ToLower(filePath), ".pdf") {
		return fmt.Errorf("file is not a PDF: %s", filePath)
	}

	log.Printf("📊 File validation passed: size=%d bytes", fileInfo.Size())
	return nil
}

// Convert PDF to images using poppler-utils (pdftoppm)
func convertPDFToImages(ctx context.Context, pdfPath, outputDir string) ([]string, error) {
	log.Printf("🖼️ Converting PDF to images using poppler-utils...")

	// Use pdftoppm to convert PDF to PNG images
	// -png: output as PNG format
	// -r 300: 300 DPI for good OCR quality
	// -cropbox: use crop box instead of media box
	outputPrefix := filepath.Join(outputDir, "page")
	
	cmd := exec.CommandContext(ctx, "pdftoppm", 
		"-png",           // PNG format
		"-r", "300",      // 300 DPI for OCR
		"-cropbox",       // Use crop box
		pdfPath,          // Input PDF
		outputPrefix,     // Output prefix
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

// Perform OCR on an image using command-line Tesseract
func performOCR(ctx context.Context, imagePath string) (string, error) {
	log.Printf("🔍 Performing OCR on: %s", filepath.Base(imagePath))

	// Create a temporary file for the output
	outputFile := strings.TrimSuffix(imagePath, filepath.Ext(imagePath)) + "_ocr"
	
	// Run tesseract command
	// tesseract image.png output -l eng --psm 1 --oem 1
	cmd := exec.CommandContext(ctx, "tesseract",
		imagePath,           // Input image
		outputFile,          // Output file (without .txt extension)
		"-l", "eng",         // English language
		"--psm", "1",        // Page segmentation mode: Automatic page segmentation with OSD
		"--oem", "1",        // OCR Engine Mode: LSTM neural networks
		"-c", "preserve_interword_spaces=1", // Preserve spaces between words
	)

	log.Printf("🔧 Running OCR command: %s", strings.Join(cmd.Args, " "))

	// Capture both stdout and stderr
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("❌ Tesseract command failed: %v", err)
		log.Printf("📝 Command output: %s", string(output))
		return "", fmt.Errorf("tesseract failed: %w (output: %s)", err, string(output))
	}

	// Read the output file (tesseract adds .txt extension automatically)
	textFile := outputFile + ".txt"
	defer os.Remove(textFile) // Clean up the text file

	textBytes, err := os.ReadFile(textFile)
	if err != nil {
		return "", fmt.Errorf("failed to read OCR output: %w", err)
	}

	text := string(textBytes)
	
	// Clean up the text
	cleanText := cleanOCRText(text)
	
	log.Printf("📝 OCR extracted %d characters from %s", len(cleanText), filepath.Base(imagePath))

	return cleanText, nil
}

// Clean and normalize OCR text
func cleanOCRText(text string) string {
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

// Get file size utility
func getFileSize(filePath string) int64 {
	if info, err := os.Stat(filePath); err == nil {
		return info.Size()
	}
	return 0
}