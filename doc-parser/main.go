package main

import (
	"context"
	"insightsphere/doc-parser/handlers"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
)

type ParseRequest struct {
	FilePath string `json:"filePath" binding:"required"`
}

type ParseResponse struct {
	Text       string                 `json:"text"`
	Pages      []handlers.PageData    `json:"pages"`
	Meta       map[string]interface{} `json:"meta"`
	ImagePaths map[int]string         `json:"imagePaths,omitempty"` // page_number -> temp file path
	ImagesDir  string                 `json:"imagesDir,omitempty"`  // temp directory for cleanup
}

func main() {
	// Set Gin to release mode in production
	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "healthy",
			"service":   "doc-parser",
			"timestamp": time.Now().UTC(),
			"version":   "2.1.0-ocr",
		})
	})

	r.POST("/parse/pdf", func(c *gin.Context) {
		var req ParseRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			log.Printf("❌ Invalid request: %v", err)
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		log.Printf("🚀 Starting OCR-based PDF parsing: %s", req.FilePath)

		// Create context with timeout
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
		defer cancel()

		// Parse PDF using OCR - returns pages, metadata, and PNG image paths
		pages, meta, imagePaths, imagesDir, err := handlers.HandlePDFParse(ctx, req.FilePath)
		if err != nil {
			log.Printf("❌ PDF parsing failed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		log.Printf("✅ PDF parsing completed: %d pages, %d images", meta["pages"], len(imagePaths))

		c.JSON(http.StatusOK, ParseResponse{
			Pages:      pages,
			Meta:       meta,
			ImagePaths: imagePaths,
			ImagesDir:  imagesDir,
		})
	})

	r.GET("/info", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"service":     "doc-parser",
			"version":     "2.1.0-ocr",
			"methods":     []string{"PDF-to-Image-OCR"},
			"engines":     []string{"poppler-utils", "tesseract-ocr"},
			"formats":     []string{"pdf"},
			"max_timeout": "20 minutes",
		})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("🚀 Document Parser OCR service starting on port %s", port)
	log.Printf("📋 Endpoints:")
	log.Printf("   GET  /health     - Health check")
	log.Printf("   GET  /info       - Service information")
	log.Printf("   POST /parse/pdf  - PDF OCR parsing (returns text + PNG image paths)")
	log.Fatal(r.Run(":" + port))
}
