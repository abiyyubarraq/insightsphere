package handlers

import (
	"context"
	"fmt"
	"insightsphere/doc-parser/utils"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"sync"
	"time"
)

// ImageFileInfo contains information about a generated image file
type ImageFileInfo struct {
	Path       string
	PageNumber int
	Size       int64
	Error      error
}

// ConvertPDFToJPEGImages processes a PDF file and converts pages to JPEG images with concurrent processing
func ConvertPDFToJPEGImages(ctx context.Context, filePath string) ([]string, map[string]interface{}, error) {
	log.Printf("🖼️ Converting PDF to JPEG images using poppler-utils (150 DPI)...")

	// Validate file
	if err := utils.ValidatePDFFile(filePath); err != nil {
		return nil, nil, fmt.Errorf("file validation failed: %w", err)
	}

	// Create temporary directory for images
	tempDir, err := os.MkdirTemp("", "pdf_jpeg_*")
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create temp directory: %w", err)
	}

	// Note: We don't clean up here because the API needs to read the files
	// The API will handle cleanup after uploading to storage

	log.Printf("📂 Using temp directory: %s", tempDir)

	// Step 1: Convert PDF to JPEG images using pdftoppm
	imageFiles, err := utils.ConvertPDFToJPEGImages(ctx, filePath, tempDir)
	if err != nil {
		os.RemoveAll(tempDir) // Clean up on failure
		return nil, nil, fmt.Errorf("PDF to JPEG conversion failed: %w", err)
	}

	// Step 2: Process image files concurrently (validation, metadata extraction)
	log.Printf("🚀 Starting concurrent processing of %d image files", len(imageFiles))
	processedImages := processImageFilesConcurrently(ctx, imageFiles)

	// Filter out any files with errors and sort by page number
	validResults := []ImageFileInfo{}
	for _, imgInfo := range processedImages {
		if imgInfo.Error == nil {
			validResults = append(validResults, imgInfo)
		} else {
			log.Printf("⚠️ Skipping invalid image file: %s (error: %v)", imgInfo.Path, imgInfo.Error)
		}
	}

	// Sort by page number
	sort.Slice(validResults, func(i, j int) bool {
		return validResults[i].PageNumber < validResults[j].PageNumber
	})

	// Extract paths from valid results
	validImages := make([]string, 0, len(validResults))
	for _, result := range validResults {
		validImages = append(validImages, result.Path)
	}

	if len(validImages) == 0 {
		os.RemoveAll(tempDir) // Clean up on failure
		return nil, nil, fmt.Errorf("no valid images were generated from PDF")
	}

	log.Printf("📁 Found %d valid JPEG image files", len(validImages))

	// Build metadata
	metadata := map[string]interface{}{
		"fileName":         filepath.Base(filePath),
		"fileType":         "pdf",
		"pages":            len(validImages),
		"size":             utils.GetFileSize(filePath),
		"imageFormat":      "jpeg",
		"resolution":       150,
		"conversionTool":   "poppler-utils",
		"tempDirectory":    tempDir, // API needs this to read files
	}

	return validImages, metadata, nil
}

// processImageFilesConcurrently processes image files concurrently to extract page numbers and validate files
func processImageFilesConcurrently(ctx context.Context, imageFiles []string) []ImageFileInfo {
	const batchSize = 10 // Process 10 files at a time
	totalFiles := len(imageFiles)

	// Create channels for results
	type result struct {
		info ImageFileInfo
		index int
	}

	resultChan := make(chan result, totalFiles)
	var wg sync.WaitGroup

	// Process files in batches
	for batchStart := 0; batchStart < totalFiles; batchStart += batchSize {
		batchEnd := batchStart + batchSize
		if batchEnd > totalFiles {
			batchEnd = totalFiles
		}

		// Process this batch
		for i := batchStart; i < batchEnd; i++ {
			wg.Add(1)
			go func(imgPath string, idx int) {
				defer wg.Done()

				// Check for cancellation
				select {
				case <-ctx.Done():
					resultChan <- result{
						info: ImageFileInfo{
							Path:       imgPath,
							PageNumber: 0,
							Size:       0,
							Error:      ctx.Err(),
						},
						index: idx,
					}
					return
				default:
				}

				// Extract page number from filename (e.g., "page-01.jpg" -> 1)
				fileName := filepath.Base(imgPath)
				pageNum, err := extractPageNumber(fileName)
				if err != nil {
					resultChan <- result{
						info: ImageFileInfo{
							Path:       imgPath,
							PageNumber: 0,
							Size:       0,
							Error:      fmt.Errorf("failed to extract page number: %w", err),
						},
						index: idx,
					}
					return
				}

				// Get file size
				fileInfo, err := os.Stat(imgPath)
				var size int64
				if err == nil {
					size = fileInfo.Size()
				}

				resultChan <- result{
					info: ImageFileInfo{
						Path:       imgPath,
						PageNumber: pageNum,
						Size:       size,
						Error:      nil,
					},
					index: idx,
				}
			}(imageFiles[i], i)
		}

		// Wait for batch to complete before starting next batch
		// This prevents overwhelming the system
		wg.Wait()
	}

	close(resultChan)

	// Collect all results
	results := make([]ImageFileInfo, totalFiles)
	for res := range resultChan {
		results[res.index] = res.info
	}

	return results
}

// extractPageNumber extracts page number from filename like "page-01.jpg" or "page-1.jpg"
func extractPageNumber(fileName string) (int, error) {
	// Match patterns like "page-01.jpg", "page-1.jpg", "page-001.jpg"
	re := regexp.MustCompile(`page-(\d+)\.jpg$`)
	matches := re.FindStringSubmatch(fileName)
	if len(matches) < 2 {
		return 0, fmt.Errorf("could not extract page number from filename: %s", fileName)
	}

	var pageNum int
	_, err := fmt.Sscanf(matches[1], "%d", &pageNum)
	if err != nil {
		return 0, fmt.Errorf("failed to parse page number: %w", err)
	}

	return pageNum, nil
}

// HandlePDFImages handles the /parse/pdf-images endpoint
func HandlePDFImages(ctx context.Context, filePath string) ([]string, map[string]interface{}, error) {
	// Create context with timeout if not provided
	if ctx == nil {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(context.Background(), 20*time.Minute)
		defer cancel()
	}

	return ConvertPDFToJPEGImages(ctx, filePath)
}

