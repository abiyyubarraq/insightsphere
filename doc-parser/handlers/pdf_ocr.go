package handlers

import (
	"context"
	"fmt"
	"insightsphere/doc-parser/utils"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type PageData struct {
	PageNumber int    `json:"page_number"`
	Text       string `json:"text"`
}

// ParsePDFWithOCR processes a PDF file using OCR approach
func ParsePDFWithOCR(ctx context.Context, filePath string) (string, []PageData, map[string]interface{}, error) {
	log.Printf("🔍 Starting OCR-based PDF parsing for: %s", filePath)

	// Validate file
	if err := utils.ValidatePDFFile(filePath); err != nil {
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
	imageFiles, err := utils.ConvertPDFToPNGImages(ctx, filePath, tempDir)
	if err != nil {
		return "", nil, nil, fmt.Errorf("PDF to image conversion failed: %w", err)
	}

	log.Printf("🖼️ Converted PDF to %d image files", len(imageFiles))

	// Step 2: Perform OCR on images in batches of 10
	log.Printf("🚀 Starting batch OCR processing: %d pages in batches of 10", len(imageFiles))

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
		"size":             utils.GetFileSize(filePath),
		"extractionMethod": "ocr",
		"textLength":       len(finalText),
		"ocrEngine":        "tesseract",
		"conversionTool":   "poppler-utils",
	}

	return finalText, pages, metadata, nil
}

// processPagesInBatches processes pages in batches of 10 using goroutines for concurrent processing
func processPagesInBatches(ctx context.Context, imageFiles []string) (*strings.Builder, []PageData, int, error) {
	const batchSize = 10
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

		actualBatchSize := batchEnd - batchStart
		log.Printf("🔄 Processing batch %d-%d (%d pages)", batchStart+1, batchEnd, actualBatchSize)

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

		log.Printf("✅ Batch %d-%d completed: %d/%d pages successful", batchStart+1, batchEnd, batchSuccessful, actualBatchSize)
	}

	return &allText, allPages, successfulPages, nil
}

// processBatch processes a single batch of pages concurrently
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

// performOCR performs OCR on an image using command-line Tesseract
func performOCR(ctx context.Context, imagePath string) (string, error) {
	log.Printf("🔍 Performing OCR on: %s", filepath.Base(imagePath))

	// Create a temporary file for the output
	outputFile := strings.TrimSuffix(imagePath, filepath.Ext(imagePath)) + "_ocr"

	// Run tesseract command
	// tesseract image.png output -l eng --psm 1 --oem 1
	cmd := exec.CommandContext(ctx, "tesseract",
		imagePath,                        // Input image
		outputFile,                       // Output file (without .txt extension)
		"-l", "eng",                      // English language
		"--psm", "1",                     // Page segmentation mode: Automatic page segmentation with OSD
		"--oem", "1",                     // OCR Engine Mode: LSTM neural networks
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
	cleanText := utils.CleanOCRText(text)

	log.Printf("📝 OCR extracted %d characters from %s", len(cleanText), filepath.Base(imagePath))

	return cleanText, nil
}

// HandlePDFParse handles the /parse/pdf endpoint
func HandlePDFParse(ctx context.Context, filePath string) (string, []PageData, map[string]interface{}, error) {
	// Create context with timeout if not provided
	if ctx == nil {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(context.Background(), 20*time.Minute)
		defer cancel()
	}

	return ParsePDFWithOCR(ctx, filePath)
}

