package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
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
	log.Printf("   GET  /health      - Health check jembot")
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

	// Step 2: Perform OCR on images in batches of 5
	log.Printf("🚀 Starting batch OCR processing: %d pages in batches of 5", len(imageFiles))
	
	allText, pages, successfulPages, err := processPagesInBatches(ctx, imageFiles)
	if err != nil {
		return "", nil, nil, fmt.Errorf("batch processing failed: %w", err)
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

// Process pages in batches of 5 using goroutines for concurrent processing
func processPagesInBatches(ctx context.Context, imageFiles []string) (*strings.Builder, []PageData, int, error) {
	const batchSize = 5
	totalPages := len(imageFiles)
	
	var allText strings.Builder
	var allPages []PageData
	successfulPages := 0
	
	// Process in batches
	for batchStart := 0; batchStart < totalPages; batchStart += batchSize {
		batchEnd := batchStart + batchSize
		if batchEnd > totalPages {
			batchEnd = totalPages
		}
		
		batchSize := batchEnd - batchStart
		log.Printf("🔄 Processing batch %d-%d (%d pages)", batchStart+1, batchEnd, batchSize)
		
		// Check for cancellation before each batch
		select {
		case <-ctx.Done():
			return nil, nil, 0, fmt.Errorf("processing cancelled: %w", ctx.Err())
		default:
		}
		
		// Process this batch concurrently
		batchText, batchPages, batchSuccessful, err := processBatch(ctx, imageFiles[batchStart:batchEnd], batchStart)
		if err != nil {
			return nil, nil, 0, fmt.Errorf("batch processing failed: %w", err)
		}
		
		// Merge results
		allText.WriteString(batchText.String())
		allPages = append(allPages, batchPages...)
		successfulPages += batchSuccessful
		
		log.Printf("✅ Batch %d-%d completed: %d/%d pages successful", batchStart+1, batchEnd, batchSuccessful, batchSize)
	}
	
	return &allText, allPages, successfulPages, nil
}

// Process a single batch of pages concurrently
func processBatch(ctx context.Context, imageFiles []string, startIndex int) (*strings.Builder, []PageData, int, error) {
	batchSize := len(imageFiles)
	
	// Create channels for results
	type pageResult struct {
		pageNum int
		text    string
		success bool
		err     error
	}
	
	resultChan := make(chan pageResult, batchSize)
	
	// Start goroutines for each page in the batch
	for i, imageFile := range imageFiles {
		pageNum := startIndex + i + 1
		
		go func(imgFile string, pNum int) {
			// Check for cancellation
			select {
			case <-ctx.Done():
				resultChan <- pageResult{
					pageNum: pNum,
					text:    "",
					success: false,
					err:     ctx.Err(),
				}
				return
			default:
			}
			
			// Perform OCR
			pageText, err := performOCR(ctx, imgFile)
			if err != nil {
				log.Printf("⚠️ OCR failed for page %d: %v", pNum, err)
				resultChan <- pageResult{
					pageNum: pNum,
					text:    "",
					success: false,
					err:     err,
				}
				return
			}
			
			// Clean and process the text
			cleanText := strings.TrimSpace(pageText)
			success := len(cleanText) > 0
			
			if success {
				log.Printf("📝 Page %d: extracted %d characters", pNum, len(cleanText))
				
				// Show preview of extracted text
				preview := cleanText
				if len(preview) > 100 {
					preview = preview[:100] + "..."
				}
				log.Printf("📖 Page %d preview: %q", pNum, preview)
			} else {
				log.Printf("⚠️ Page %d: no text extracted", pNum)
			}
			
			resultChan <- pageResult{
				pageNum: pNum,
				text:    cleanText,
				success: success,
				err:     nil,
			}
		}(imageFile, pageNum)
	}
	
	// Collect results
	var allText strings.Builder
	var pages []PageData
	successfulPages := 0
	
	// Create a map to store results by page number for proper ordering
	results := make(map[int]pageResult)
	
	// Collect all results
	for i := 0; i < batchSize; i++ {
		result := <-resultChan
		results[result.pageNum] = result
	}
	
	// Sort pages by page number and build final results
	var pageNumbers []int
	for pageNum := range results {
		pageNumbers = append(pageNumbers, pageNum)
	}
	sort.Ints(pageNumbers)
	
	for _, pageNum := range pageNumbers {
		result := results[pageNum]
		
		// Check for errors
		if result.err != nil {
			log.Printf("❌ Page %d processing error: %v", pageNum, result.err)
		}
		
		// Add to pages slice
		pages = append(pages, PageData{
			PageNumber: pageNum,
			Text:       result.text,
		})
		
		// Add to combined text if successful
		if result.success {
			successfulPages++
			allText.WriteString(result.text)
			allText.WriteString("\n\n")
		}
	}
	
	return &allText, pages, successfulPages, nil
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