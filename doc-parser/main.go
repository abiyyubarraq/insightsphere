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

// Shared request/response types
type ParseRequest struct {
	FilePath string `json:"filePath" binding:"required"`
}

type ParseResponse struct {
	Text  string                 `json:"text"`
	Pages []handlers.PageData    `json:"pages"`
	Meta  map[string]interface{} `json:"meta"`
}

type PDFImagesResponse struct {
	ImagePaths []string               `json:"imagePaths"`
	PageCount  int                    `json:"pageCount"`
	Meta       map[string]interface{} `json:"meta"`
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
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
		defer cancel()

		// Parse PDF using OCR
		text, pages, meta, err := handlers.HandlePDFParse(ctx, req.FilePath)
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

	// PDF to JPEG images endpoint
	r.POST("/parse/pdf-images", func(c *gin.Context) {
		var req ParseRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			log.Printf("❌ Invalid request: %v", err)
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		log.Printf("🖼️ Starting PDF to JPEG conversion: %s", req.FilePath)

		// Create context with timeout
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()

		// Convert PDF to JPEG images
		imagePaths, meta, err := handlers.HandlePDFImages(ctx, req.FilePath)
		if err != nil {
			log.Printf("❌ PDF to image conversion failed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		log.Printf("✅ PDF to JPEG conversion completed: %d pages", len(imagePaths))

		c.JSON(http.StatusOK, PDFImagesResponse{
			ImagePaths: imagePaths,
			PageCount:  len(imagePaths),
			Meta:      meta,
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
	log.Printf("   GET  /health          - Health check jembot")
	log.Printf("   GET  /info            - Service information")
	log.Printf("   POST /parse/pdf       - PDF OCR parsing")
	log.Printf("   POST /parse/pdf-images - PDF to JPEG images conversion")
	log.Fatal(r.Run(":" + port))
}
