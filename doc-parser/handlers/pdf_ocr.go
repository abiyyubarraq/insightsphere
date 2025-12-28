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
	"sync"
	"time"
)

type PageData struct {
	PageNumber int    `json:"page_number"`
	Text       string `json:"text"`
	ImagePath  string `json:"image_path,omitempty"` 
}


type PipelineMetrics struct {
	TotalDuration      time.Duration
	ConversionDuration time.Duration
	OCRDuration        time.Duration
	PagesProcessed     int
	AvgConversionTime  time.Duration
	AvgOCRTime         time.Duration
}


func ParsePDFWithOCR(ctx context.Context, filePath string) ([]PageData, map[string]interface{}, map[int]string, string, error) {
	pipelineStart := time.Now()
	log.Printf("🔍 Starting OPTIMIZED OCR pipeline for: %s", filePath)

	if err := utils.ValidatePDFFile(filePath); err != nil {
		return nil, nil, nil, "", fmt.Errorf("file validation failed: %w", err)
	}

	pageCount, err := utils.GetPDFPageCount(filePath)
	if err != nil {
		log.Printf("⚠️ Could not get page count, falling back to batch mode: %v", err)
		return ParsePDFWithOCRBatch(ctx, filePath)
	}

	log.Printf("📄 PDF has %d pages, using streaming pipeline", pageCount)

	tempDir, err := os.MkdirTemp("", "pdf_ocr_*")
	if err != nil {
		return nil, nil, nil, "", fmt.Errorf("failed to create temp directory: %w", err)
	}
	
	log.Printf("📂 Temp directory: %s", tempDir)

	text, pages, imagePaths, metrics, err := streamingOCRPipeline(ctx, filePath, tempDir, pageCount)
	if err != nil {
		os.RemoveAll(tempDir)
		return nil, nil, nil, "", err
	}

	totalDuration := time.Since(pipelineStart)
	successfulPages := len(pages)

	log.Printf("✅ Pipeline completed in %v", totalDuration)
	log.Printf("📊 Metrics: Conversion=%v, OCR=%v, Avg/page: Conv=%v, OCR=%v",
		metrics.ConversionDuration, metrics.OCRDuration,
		metrics.AvgConversionTime, metrics.AvgOCRTime)
	log.Printf("🖼️ Generated %d PNG images in %s", len(imagePaths), tempDir)

	if files, err := os.ReadDir(tempDir); err == nil {
		log.Printf("📂 Temp directory contents (%d files):", len(files))
		for _, f := range files {
			log.Printf("   - %s", f.Name())
		}
	}

	log.Printf("🗺️ imagePaths map contents (%d entries):", len(imagePaths))
	for pageNum, path := range imagePaths {
		log.Printf("   - Page %d: %s", pageNum, path)
	}

	metadata := map[string]interface{}{
		"fileName":          filepath.Base(filePath),
		"fileType":          "pdf",
		"pages":             pageCount,
		"successfulPages":   successfulPages,
		"size":              utils.GetFileSize(filePath),
		"extractionMethod":  "ocr-streaming",
		"textLength":        len(text),
		"ocrEngine":         "tesseract",
		"conversionTool":    "poppler-utils",
		"dpi":               200,
		"colorMode":         "grayscale",
		"totalDurationMs":   totalDuration.Milliseconds(),
		"conversionMs":      metrics.ConversionDuration.Milliseconds(),
		"ocrMs":             metrics.OCRDuration.Milliseconds(),
		"avgConversionMs":   metrics.AvgConversionTime.Milliseconds(),
		"avgOcrMs":          metrics.AvgOCRTime.Milliseconds(),
	}

	return pages, metadata, imagePaths, tempDir, nil
}

func streamingOCRPipeline(ctx context.Context, pdfPath, tempDir string, pageCount int) (string, []PageData, map[int]string, PipelineMetrics, error) {

	conversionWorkers := min(3, pageCount)  
	ocrWorkers := min(3, pageCount)         

	log.Printf("🔧 Worker config: %d conversion workers, %d OCR workers (max 3 to prevent CPU contention)", conversionWorkers, ocrWorkers)

	type conversionJob struct {
		pageNum int
	}
	type conversionResult struct {
		pageNum   int
		imagePath string 
		duration  time.Duration
		err       error
	}
	type ocrResult struct {
		pageNum   int
		text      string
		imagePath string 
		duration  time.Duration
		err       error
	}

	jobsChan := make(chan conversionJob, pageCount)
	imagesChan := make(chan conversionResult, pageCount)
	resultsChan := make(chan ocrResult, pageCount)

	var wg sync.WaitGroup
	var totalConversionTime, totalOCRTime time.Duration
	var convMu, ocrMu sync.Mutex

	for w := 0; w < conversionWorkers; w++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for job := range jobsChan {
				select {
				case <-ctx.Done():
					imagesChan <- conversionResult{pageNum: job.pageNum, err: ctx.Err()}
					return
				default:
				}

				pngPath, duration, err := utils.ConvertSinglePageToGrayPNG(ctx, pdfPath, job.pageNum, tempDir)

				if err == nil {
					log.Printf("🖼️ Page %d: PNG generated at %s", job.pageNum, pngPath)
				}

				convMu.Lock()
				totalConversionTime += duration
				convMu.Unlock()

				imagesChan <- conversionResult{
					pageNum:   job.pageNum,
					imagePath: pngPath,
					duration:  duration,
					err:       err,
				}
			}
		}(w)
	}

	var ocrWg sync.WaitGroup
	for w := 0; w < ocrWorkers; w++ {
		ocrWg.Add(1)
		go func(workerID int) {
			defer ocrWg.Done()
			for img := range imagesChan {
				if img.err != nil {
					resultsChan <- ocrResult{pageNum: img.pageNum, err: img.err}
					continue
				}

				select {
				case <-ctx.Done():
					resultsChan <- ocrResult{pageNum: img.pageNum, err: ctx.Err()}
					return
				default:
				}

				startOCR := time.Now()
				text, err := performOCR(ctx, img.imagePath)
				ocrDuration := time.Since(startOCR)

				ocrMu.Lock()
				totalOCRTime += ocrDuration
				ocrMu.Unlock()

				resultsChan <- ocrResult{
					pageNum:   img.pageNum,
					text:      text,
					imagePath: img.imagePath, 
					duration:  ocrDuration,
					err:       err,
				}
			}
		}(w)
	}

	go func() {
		for i := 1; i <= pageCount; i++ {
			jobsChan <- conversionJob{pageNum: i}
		}
		close(jobsChan)
	}()

	go func() {
		wg.Wait()
		close(imagesChan)
	}()

	go func() {
		ocrWg.Wait()
		close(resultsChan)
	}()

	
	results := make(map[int]ocrResult)
	for result := range resultsChan {
		results[result.pageNum] = result
		if result.err != nil {
			log.Printf("⚠️ Page %d error: %v", result.pageNum, result.err)
		} else {
			log.Printf("📝 Page %d: %d chars (OCR: %v)", result.pageNum, len(result.text), result.duration)
		}
	}

	var allText strings.Builder
	var pages []PageData
	var pageNums []int
	imagePaths := make(map[int]string)

	for pageNum := range results {
		pageNums = append(pageNums, pageNum)
	}
	sort.Ints(pageNums)

	for _, pageNum := range pageNums {
		result := results[pageNum]
		cleanText := strings.TrimSpace(result.text)

		pages = append(pages, PageData{
			PageNumber: pageNum,
			Text:       cleanText,
			ImagePath:  result.imagePath,
		})

		if result.imagePath != "" {
			imagePaths[pageNum] = result.imagePath
		}

		if len(cleanText) > 0 {
			allText.WriteString(cleanText)
			allText.WriteString("\n\n")
		}
	}

	metrics := PipelineMetrics{
		PagesProcessed:     pageCount,
		ConversionDuration: totalConversionTime,
		OCRDuration:        totalOCRTime,
	}
	if pageCount > 0 {
		metrics.AvgConversionTime = totalConversionTime / time.Duration(pageCount)
		metrics.AvgOCRTime = totalOCRTime / time.Duration(pageCount)
	}

	return strings.TrimSpace(allText.String()), pages, imagePaths, metrics, nil
}

func ParsePDFWithOCRBatch(ctx context.Context, filePath string) ([]PageData, map[string]interface{}, map[int]string, string, error) {
	log.Printf("🔍 Using BATCH OCR mode for: %s", filePath)

	if err := utils.ValidatePDFFile(filePath); err != nil {
		return nil, nil, nil, "", fmt.Errorf("file validation failed: %w", err)
	}

	tempDir, err := os.MkdirTemp("", "pdf_ocr_*")
	if err != nil {
		return nil, nil, nil, "", fmt.Errorf("failed to create temp directory: %w", err)
	}

	log.Printf("📂 Using temp directory: %s", tempDir)

	imageFiles, err := utils.ConvertPDFToGrayPNGImages(ctx, filePath, tempDir)
	if err != nil {
		os.RemoveAll(tempDir) 
		return nil, nil, nil, "", fmt.Errorf("PDF to image conversion failed: %w", err)
	}

	log.Printf("🖼️ Converted PDF to %d image files", len(imageFiles))

	log.Printf("🚀 Starting batch OCR processing: %d pages in batches of 3", len(imageFiles))

	pages, successfulPages, err := processPagesInBatches(ctx, imageFiles)
	if err != nil {
		os.RemoveAll(tempDir) 
		return nil, nil, nil, "", fmt.Errorf("batch processing failed: %w", err)
	}

	totalPages := len(imageFiles)

	log.Printf("✅ OCR completed: %d/%d pages successful", successfulPages, totalPages)

	imagePaths := make(map[int]string)
	for i, imgPath := range imageFiles {
		imagePaths[i+1] = imgPath 
	}

	metadata := map[string]interface{}{
		"fileName":         filepath.Base(filePath),
		"fileType":         "pdf",
		"pages":            totalPages,
		"successfulPages":  successfulPages,
		"size":             utils.GetFileSize(filePath),
		"extractionMethod": "ocr-batch",
		"ocrEngine":        "tesseract",
		"conversionTool":   "poppler-utils",
		"dpi":              200,
		"colorMode":        "grayscale",
	}

	log.Printf("🖼️ Returning %d PNG paths for upload", len(imagePaths))
	return pages, metadata, imagePaths, tempDir, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func processPagesInBatches(ctx context.Context, imageFiles []string) ([]PageData, int, error) {
	const batchSize = 3
	totalPages := len(imageFiles)

	var allPages []PageData
	successfulPages := 0

	for batchStart := 0; batchStart < totalPages; batchStart += batchSize {
		batchEnd := batchStart + batchSize
		if batchEnd > totalPages {
			batchEnd = totalPages
		}

		actualBatchSize := batchEnd - batchStart
		log.Printf("🔄 Processing batch %d-%d (%d pages)", batchStart+1, batchEnd, actualBatchSize)

		select {
		case <-ctx.Done():
			return nil, 0, fmt.Errorf("processing cancelled: %w", ctx.Err())
		default:
		}

		batchPages, batchSuccessful, err := processBatch(ctx, imageFiles[batchStart:batchEnd], batchStart)
		if err != nil {
			return nil, 0, fmt.Errorf("batch processing failed: %w", err)
		}

		allPages = append(allPages, batchPages...)
		successfulPages += batchSuccessful

		log.Printf("✅ Batch %d-%d completed: %d/%d pages successful", batchStart+1, batchEnd, batchSuccessful, actualBatchSize)
	}

	return allPages, successfulPages, nil
}

func processBatch(ctx context.Context, imageFiles []string, startIndex int) ([]PageData, int, error) {
	batchSize := len(imageFiles)

	type pageResult struct {
		pageNum int
		text    string
		success bool
		err     error
	}

	resultChan := make(chan pageResult, batchSize)

	for i, imageFile := range imageFiles {
		pageNum := startIndex + i + 1

		go func(imgFile string, pNum int) {
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

			cleanText := strings.TrimSpace(pageText)
			success := len(cleanText) > 0

			if success {
				log.Printf("📝 Page %d: extracted %d characters", pNum, len(cleanText))

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

	var pages []PageData
	successfulPages := 0

	results := make(map[int]pageResult)

	for i := 0; i < batchSize; i++ {
		result := <-resultChan
		results[result.pageNum] = result
	}

	var pageNumbers []int
	for pageNum := range results {
		pageNumbers = append(pageNumbers, pageNum)
	}
	sort.Ints(pageNumbers)

	for _, pageNum := range pageNumbers {
		result := results[pageNum]

		if result.err != nil {
			log.Printf("❌ Page %d processing error: %v", pageNum, result.err)
		}

		pages = append(pages, PageData{
			PageNumber: pageNum,
			Text:       result.text,
		})

		if result.success {
			successfulPages++
		}
	}

	return pages, successfulPages, nil
}

func performOCR(ctx context.Context, imagePath string) (string, error) {
	log.Printf("🔍 Performing OCR on: %s", filepath.Base(imagePath))

	outputFile := strings.TrimSuffix(imagePath, filepath.Ext(imagePath)) + "_ocr"

	cmd := exec.CommandContext(ctx, "tesseract",
		imagePath,                        // Input image
		outputFile,                       // Output file (without .txt extension)
		"-l", "eng",                      // English language
		"--psm", "1",                     // Page segmentation mode: Automatic page segmentation with OSD
		"--oem", "1",                     // OCR Engine Mode: LSTM neural networks
		"-c", "preserve_interword_spaces=1", // Preserve spaces between words
	)

	log.Printf("🔧 Running OCR command: %s", strings.Join(cmd.Args, " "))

	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("❌ Tesseract command failed: %v", err)
		log.Printf("📝 Command output: %s", string(output))
		return "", fmt.Errorf("tesseract failed: %w (output: %s)", err, string(output))
	}


	textFile := outputFile + ".txt"
	defer os.Remove(textFile)

	textBytes, err := os.ReadFile(textFile)
	if err != nil {
		return "", fmt.Errorf("failed to read OCR output: %w", err)
	}

	text := string(textBytes)

	cleanText := utils.CleanOCRText(text)

	log.Printf("📝 OCR extracted %d characters from %s", len(cleanText), filepath.Base(imagePath))

	return cleanText, nil
}

func HandlePDFParse(ctx context.Context, filePath string) ([]PageData, map[string]interface{}, map[int]string, string, error) {
	if ctx == nil {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(context.Background(), 20*time.Minute)
		defer cancel()
	}

	return ParsePDFWithOCR(ctx, filePath)
}

