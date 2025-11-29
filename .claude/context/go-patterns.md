# Go Service Patterns & OCR Pipeline

**Comprehensive guide to Go microservice development, OCR pipeline implementation, and best practices for InsightSphere parser service.**

---

## Table of Contents

1. [Go Basics for Microservices](#go-basics-for-microservices)
2. [Error Handling](#error-handling)
3. [Context & Cancellation](#context--cancellation)
4. [Concurrent Processing](#concurrent-processing)
5. [Gin Framework](#gin-framework)
6. [OCR Pipeline Implementation](#ocr-pipeline-implementation)
7. [File Operations](#file-operations)
8. [Testing](#testing)
9. [Performance Optimization](#performance-optimization)
10. [Deployment](#deployment)

---

## Go Basics for Microservices

### Project Structure

```
doc-parser/
├── main.go              # Entry point
├── handlers/            # HTTP handlers
│   └── parser.go
├── services/            # Business logic
│   ├── pdf.go
│   └── ocr.go
├── models/              # Data structures
│   └── document.go
├── utils/               # Utilities
│   └── file.go
├── go.mod               # Module definition
├── go.sum               # Dependency checksums
└── Dockerfile           # Container configuration
```

### go.mod Example

```go
module github.com/yourusername/insightsphere/doc-parser

go 1.24

require (
    github.com/gin-gonic/gin v1.9.1
)
```

### Main Entry Point

```go
// main.go
package main

import (
    "context"
    "log"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"

    "github.com/gin-gonic/gin"
)

func main() {
    // Setup router
    r := gin.Default()

    // Health check
    r.GET("/health", func(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{
            "status": "healthy",
            "service": "doc-parser",
        })
    })

    // Routes
    r.POST("/parse/pdf", ParsePDF)

    // Start server
    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }

    srv := &http.Server{
        Addr:    ":" + port,
        Handler: r,
    }

    // Graceful shutdown
    go func() {
        if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("Server failed: %v", err)
        }
    }()

    log.Printf("🚀 Server running on port %s", port)

    // Wait for interrupt signal
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    log.Println("Shutting down server...")

    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    if err := srv.Shutdown(ctx); err != nil {
        log.Fatal("Server forced to shutdown:", err)
    }

    log.Println("Server exited")
}
```

---

## Error Handling

### Error Patterns

#### Basic Error Handling

```go
// ✅ Good - always check errors
result, err := processDocument(ctx, filePath)
if err != nil {
    return nil, fmt.Errorf("failed to process document: %w", err)
}

// ❌ Bad - never ignore errors
result, _ := processDocument(ctx, filePath)
```

#### Error Wrapping

```go
import "fmt"

// Wrap errors with context
func extractText(filePath string) (string, error) {
    file, err := os.Open(filePath)
    if err != nil {
        return "", fmt.Errorf("open file %s: %w", filePath, err)
    }
    defer file.Close()

    // Process file...

    return text, nil
}

// Error chain:
// "process document: open file /tmp/doc.pdf: no such file or directory"
```

#### Custom Error Types

```go
type ProcessingError struct {
    FilePath string
    Stage    string
    Err      error
}

func (e *ProcessingError) Error() string {
    return fmt.Sprintf("%s failed for %s: %v", e.Stage, e.FilePath, e.Err)
}

func (e *ProcessingError) Unwrap() error {
    return e.Err
}

// Usage
func processPDF(filePath string) error {
    // ... processing

    if err != nil {
        return &ProcessingError{
            FilePath: filePath,
            Stage:    "OCR extraction",
            Err:      err,
        }
    }

    return nil
}
```

#### Error Checking

```go
import "errors"

// Check specific error
if errors.Is(err, os.ErrNotExist) {
    log.Println("File does not exist")
}

// Check error type
var procErr *ProcessingError
if errors.As(err, &procErr) {
    log.Printf("Processing failed at stage: %s", procErr.Stage)
}
```

---

## Context & Cancellation

### Context Basics

```go
import "context"

// Create context with timeout
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()

// Create context with deadline
deadline := time.Now().Add(1 * time.Minute)
ctx, cancel := context.WithDeadline(context.Background(), deadline)
defer cancel()

// Create cancellable context
ctx, cancel := context.WithCancel(context.Background())
defer cancel()

// Cancel from another goroutine
go func() {
    time.Sleep(5 * time.Second)
    cancel()  // Cancel after 5 seconds
}()
```

### Context in HTTP Handlers

```go
func ParsePDF(c *gin.Context) {
    // Create context with timeout
    ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
    defer cancel()

    var req ParseRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
        return
    }

    // Use context in operations
    pages, err := extractTextFromPDF(ctx, req.FilePath)
    if err != nil {
        // Check if context was cancelled or timed out
        if ctx.Err() == context.DeadlineExceeded {
            c.JSON(http.StatusRequestTimeout, gin.H{
                "error": "processing timeout after 30 seconds",
            })
            return
        }

        if ctx.Err() == context.Canceled {
            c.JSON(http.StatusRequestTimeout, gin.H{
                "error": "request cancelled",
            })
            return
        }

        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }

    c.JSON(http.StatusOK, gin.H{"pages": pages})
}
```

### Context Propagation

```go
func extractTextFromPDF(ctx context.Context, filePath string) ([]Page, error) {
    // Check context before expensive operations
    select {
    case <-ctx.Done():
        return nil, ctx.Err()
    default:
    }

    // Convert PDF to images (respects context)
    imageDir, err := convertPDFToImages(ctx, filePath)
    if err != nil {
        return nil, fmt.Errorf("pdf conversion: %w", err)
    }
    defer os.RemoveAll(imageDir)

    // Extract text (respects context)
    pages, err := extractPages(ctx, imageDir)
    if err != nil {
        return nil, fmt.Errorf("text extraction: %w", err)
    }

    return pages, nil
}

func convertPDFToImages(ctx context.Context, pdfPath string) (string, error) {
    cmd := exec.CommandContext(ctx, "pdftoppm", "-jpeg", pdfPath, "output")
    // CommandContext automatically handles cancellation
    if err := cmd.Run(); err != nil {
        return "", err
    }

    return outputDir, nil
}
```

---

## Concurrent Processing

### WaitGroup Pattern

```go
import "sync"

func processPages(ctx context.Context, pages []PageData) ([]Page, error) {
    var wg sync.WaitGroup
    results := make([]Page, len(pages))
    errors := make(chan error, len(pages))

    for i, pageData := range pages {
        wg.Add(1)

        go func(index int, data PageData) {
            defer wg.Done()

            // Check context
            select {
            case <-ctx.Done():
                errors <- ctx.Err()
                return
            default:
            }

            // Process page
            result, err := extractPageText(ctx, data)
            if err != nil {
                errors <- fmt.Errorf("page %d: %w", index, err)
                return
            }

            results[index] = result
        }(i, pageData)
    }

    // Wait for all goroutines
    wg.Wait()
    close(errors)

    // Check for errors
    if len(errors) > 0 {
        return nil, <-errors
    }

    return results, nil
}
```

### Semaphore Pattern (Limit Concurrency)

```go
// Limit to 5 concurrent operations
func processWithLimit(ctx context.Context, items []Item) ([]Result, error) {
    semaphore := make(chan struct{}, 5)  // Buffer size = max concurrency
    var wg sync.WaitGroup
    results := make([]Result, len(items))
    errors := make(chan error, len(items))

    for i, item := range items {
        wg.Add(1)

        go func(index int, it Item) {
            defer wg.Done()

            // Acquire semaphore
            semaphore <- struct{}{}
            defer func() { <-semaphore }()  // Release semaphore

            result, err := processItem(ctx, it)
            if err != nil {
                errors <- err
                return
            }

            results[index] = result
        }(i, item)
    }

    wg.Wait()
    close(errors)

    if len(errors) > 0 {
        return nil, <-errors
    }

    return results, nil
}
```

### Worker Pool Pattern

```go
func workerPool(ctx context.Context, jobs <-chan Job) <-chan Result {
    results := make(chan Result)
    workerCount := 10

    var wg sync.WaitGroup

    // Start workers
    for i := 0; i < workerCount; i++ {
        wg.Add(1)

        go func(workerID int) {
            defer wg.Done()

            for job := range jobs {
                // Check context
                select {
                case <-ctx.Done():
                    return
                default:
                }

                // Process job
                result := processJob(ctx, job)
                results <- result
            }
        }(i)
    }

    // Close results when all workers done
    go func() {
        wg.Wait()
        close(results)
    }()

    return results
}
```

---

## Gin Framework

### Basic Routing

```go
func setupRouter() *gin.Engine {
    r := gin.Default()

    // GET request
    r.GET("/health", func(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{"status": "healthy"})
    })

    // POST request with JSON binding
    r.POST("/parse/pdf", ParsePDF)

    // Route parameters
    r.GET("/documents/:id", func(c *gin.Context) {
        id := c.Param("id")
        c.JSON(http.StatusOK, gin.H{"documentId": id})
    })

    // Query parameters
    r.GET("/search", func(c *gin.Context) {
        query := c.Query("q")           // Single value
        page := c.DefaultQuery("page", "1")  // With default
        c.JSON(http.StatusOK, gin.H{"query": query, "page": page})
    })

    return r
}
```

### Request Binding

```go
type ParseRequest struct {
    FilePath string `json:"filePath" binding:"required"`
    Language string `json:"language" binding:"omitempty,oneof=eng spa fra"`
}

func ParsePDF(c *gin.Context) {
    var req ParseRequest

    // Bind and validate JSON
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{
            "error": "invalid request",
            "details": err.Error(),
        })
        return
    }

    // req.FilePath is guaranteed to be non-empty
    // req.Language is either eng, spa, fra, or empty

    c.JSON(http.StatusOK, gin.H{"message": "processing"})
}
```

### Middleware

```go
// Logging middleware
func LoggerMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        start := time.Now()

        // Process request
        c.Next()

        // Log after request
        duration := time.Since(start)
        status := c.Writer.Status()
        log.Printf("%s %s %d %v", c.Request.Method, c.Request.URL.Path, status, duration)
    }
}

// Error handling middleware
func ErrorMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        c.Next()

        // Check for errors
        if len(c.Errors) > 0 {
            err := c.Errors.Last()
            log.Printf("Error: %v", err.Err)

            c.JSON(http.StatusInternalServerError, gin.H{
                "error": "internal server error",
            })
        }
    }
}

// Apply middleware
r := gin.New()
r.Use(LoggerMiddleware())
r.Use(ErrorMiddleware())
```

---

## OCR Pipeline Implementation

### PDF → Images → Text Pipeline

```go
type Page struct {
    Number int    `json:"number"`
    Text   string `json:"text"`
}

func processPDF(ctx context.Context, pdfPath string) ([]Page, error) {
    // Step 1: Convert PDF to images
    imageDir, err := convertPDFToImages(ctx, pdfPath)
    if err != nil {
        return nil, fmt.Errorf("pdf conversion: %w", err)
    }
    defer os.RemoveAll(imageDir)  // Cleanup

    // Step 2: Get page count
    pageCount, err := getPDFPageCount(pdfPath)
    if err != nil {
        return nil, fmt.Errorf("page count: %w", err)
    }

    // Step 3: Parallel OCR processing
    var wg sync.WaitGroup
    pages := make([]Page, pageCount)
    errors := make(chan error, pageCount)

    for i := 0; i < pageCount; i++ {
        wg.Add(1)

        go func(pageNum int) {
            defer wg.Done()

            imagePath := filepath.Join(imageDir, fmt.Sprintf("page-%d.jpg", pageNum+1))

            text, err := extractTextFromImage(ctx, imagePath)
            if err != nil {
                errors <- fmt.Errorf("page %d: %w", pageNum+1, err)
                return
            }

            pages[pageNum] = Page{
                Number: pageNum + 1,
                Text:   text,
            }
        }(i)
    }

    wg.Wait()
    close(errors)

    // Check for errors
    if len(errors) > 0 {
        return nil, <-errors
    }

    return pages, nil
}
```

### PDF to Images (poppler-utils)

```go
func convertPDFToImages(ctx context.Context, pdfPath string) (string, error) {
    // Create temp directory
    tmpDir, err := os.MkdirTemp("", "pdf-images-*")
    if err != nil {
        return "", fmt.Errorf("create temp dir: %w", err)
    }

    outputPrefix := filepath.Join(tmpDir, "page")

    // Run pdftoppm command
    cmd := exec.CommandContext(ctx, "pdftoppm", "-jpeg", "-r", "300", pdfPath, outputPrefix)

    output, err := cmd.CombinedOutput()
    if err != nil {
        os.RemoveAll(tmpDir)
        return "", fmt.Errorf("pdftoppm failed: %w, output: %s", err, output)
    }

    return tmpDir, nil
}

func getPDFPageCount(pdfPath string) (int, error) {
    cmd := exec.Command("pdfinfo", pdfPath)
    output, err := cmd.CombinedOutput()
    if err != nil {
        return 0, fmt.Errorf("pdfinfo failed: %w", err)
    }

    // Parse output for "Pages: N"
    lines := strings.Split(string(output), "\n")
    for _, line := range lines {
        if strings.HasPrefix(line, "Pages:") {
            parts := strings.Fields(line)
            if len(parts) >= 2 {
                count, err := strconv.Atoi(parts[1])
                if err != nil {
                    return 0, fmt.Errorf("parse page count: %w", err)
                }
                return count, nil
            }
        }
    }

    return 0, fmt.Errorf("page count not found in pdfinfo output")
}
```

### Image to Text (Tesseract OCR)

```go
func extractTextFromImage(ctx context.Context, imagePath string) (string, error) {
    // Run tesseract command
    cmd := exec.CommandContext(ctx, "tesseract", imagePath, "stdout", "-l", "eng")

    output, err := cmd.CombinedOutput()
    if err != nil {
        return "", fmt.Errorf("tesseract failed: %w", err)
    }

    text := string(output)

    // Clean up text (remove extra whitespace)
    text = strings.TrimSpace(text)

    return text, nil
}
```

---

## File Operations

### Safe File Operations

```go
// Create file with cleanup
func createTempFile(data []byte) (string, error) {
    tmpFile, err := os.CreateTemp("", "upload-*.pdf")
    if err != nil {
        return "", fmt.Errorf("create temp file: %w", err)
    }
    defer tmpFile.Close()

    if _, err := tmpFile.Write(data); err != nil {
        os.Remove(tmpFile.Name())
        return "", fmt.Errorf("write temp file: %w", err)
    }

    return tmpFile.Name(), nil
}

// Cleanup with error handling
func cleanup(filePath string) {
    if err := os.Remove(filePath); err != nil {
        log.Printf("Failed to cleanup %s: %v", filePath, err)
    }
}

// Defer cleanup
func processFile(filePath string) error {
    tempFile, err := createTempFile(data)
    if err != nil {
        return err
    }
    defer cleanup(tempFile)

    // Process file...

    return nil
}
```

### Directory Operations

```go
// List files in directory
func listFiles(dirPath string) ([]string, error) {
    entries, err := os.ReadDir(dirPath)
    if err != nil {
        return nil, fmt.Errorf("read dir: %w", err)
    }

    var files []string
    for _, entry := range entries {
        if !entry.IsDir() {
            files = append(files, entry.Name())
        }
    }

    return files, nil
}

// Create directory
func ensureDir(path string) error {
    if err := os.MkdirAll(path, 0755); err != nil {
        return fmt.Errorf("create directory: %w", err)
    }
    return nil
}

// Remove directory recursively
func removeDir(path string) error {
    if err := os.RemoveAll(path); err != nil {
        return fmt.Errorf("remove directory: %w", err)
    }
    return nil
}
```

---

## Testing

### Unit Tests

```go
// services/ocr_test.go
package services

import (
    "context"
    "testing"
    "time"
)

func TestExtractTextFromImage(t *testing.T) {
    ctx := context.Background()

    text, err := extractTextFromImage(ctx, "testdata/sample.jpg")
    if err != nil {
        t.Fatalf("extractTextFromImage failed: %v", err)
    }

    if text == "" {
        t.Error("expected non-empty text")
    }
}

func TestExtractTextFromImage_Timeout(t *testing.T) {
    ctx, cancel := context.WithTimeout(context.Background(), 1*time.Nanosecond)
    defer cancel()

    time.Sleep(10 * time.Millisecond)  // Ensure timeout

    _, err := extractTextFromImage(ctx, "testdata/sample.jpg")
    if err == nil {
        t.Error("expected timeout error")
    }

    if ctx.Err() != context.DeadlineExceeded {
        t.Errorf("expected DeadlineExceeded, got %v", ctx.Err())
    }
}
```

### Table-Driven Tests

```go
func TestGetPDFPageCount(t *testing.T) {
    tests := []struct {
        name     string
        pdfPath  string
        want     int
        wantErr  bool
    }{
        {
            name:    "valid single page PDF",
            pdfPath: "testdata/single-page.pdf",
            want:    1,
            wantErr: false,
        },
        {
            name:    "valid multi-page PDF",
            pdfPath: "testdata/multi-page.pdf",
            want:    10,
            wantErr: false,
        },
        {
            name:    "non-existent PDF",
            pdfPath: "testdata/nonexistent.pdf",
            want:    0,
            wantErr: true,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := getPDFPageCount(tt.pdfPath)

            if (err != nil) != tt.wantErr {
                t.Errorf("getPDFPageCount() error = %v, wantErr %v", err, tt.wantErr)
                return
            }

            if got != tt.want {
                t.Errorf("getPDFPageCount() = %v, want %v", got, tt.want)
            }
        })
    }
}
```

### Running Tests

```bash
# Run all tests
go test ./...

# Run specific package
go test ./services

# Run with coverage
go test -cover ./...

# Generate coverage report
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

---

## 🚨 Troubleshooting Common Issues

### Issue 1: CGO Errors with Tesseract

**Symptom**: `fatal error: tesseract/capi.h: No such file or directory`

**Cause**: Tesseract OCR C libraries not installed or not in path

**Solution**:
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y libtesseract-dev libleptonica-dev

# macOS
brew install tesseract

# Alpine (Docker)
RUN apk add --no-cache tesseract-ocr tesseract-ocr-dev \
    leptonica-dev gcc g++ musl-dev

# Verify installation
pkg-config --cflags --libs tesseract lept
```

**Docker Build Issues**:
```dockerfile
# Multi-stage build to reduce size
FROM golang:1.24-alpine AS builder
RUN apk add --no-cache \
    tesseract-ocr-dev \
    leptonica-dev \
    gcc g++ musl-dev

WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=1 go build -o parser main.go

FROM alpine:latest
RUN apk add --no-cache tesseract-ocr leptonica
COPY --from=builder /build/parser /parser
CMD ["/parser"]
```

---

### Issue 2: Race Condition Detected

**Symptom**: `WARNING: DATA RACE` when running tests

**Cause**: Concurrent goroutines accessing shared memory without synchronization

**Solution**:
```go
// ❌ Wrong - race condition
type Counter struct {
    count int
}

func (c *Counter) Increment() {
    c.count++  // NOT thread-safe
}

// ✅ Correct - use mutex
type Counter struct {
    mu    sync.Mutex
    count int
}

func (c *Counter) Increment() {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.count++
}

// ✅ Alternative - use atomic operations
type Counter struct {
    count atomic.Int64
}

func (c *Counter) Increment() {
    c.count.Add(1)
}
```

**Debugging**:
```bash
# Run tests with race detector
go test -race ./...

# Build with race detector (slower, for testing only)
go build -race -o parser-debug main.go
```

---

### Issue 3: Context Deadline Exceeded

**Symptom**: `context deadline exceeded` errors during OCR processing

**Cause**: Operations taking longer than context timeout

**Solution**:
```go
// ❌ Wrong - timeout too short for large PDFs
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

// ✅ Correct - appropriate timeout
ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
defer cancel()

// ✅ Better - dynamic timeout based on document size
func calculateTimeout(pageCount int) time.Duration {
    baseTimeout := 30 * time.Second
    perPageTimeout := 5 * time.Second
    return baseTimeout + time.Duration(pageCount)*perPageTimeout
}

timeout := calculateTimeout(len(pages))
ctx, cancel := context.WithTimeout(context.Background(), timeout)
defer cancel()
```

**Check Context in Loops**:
```go
for i, page := range pages {
    // Check if context cancelled
    select {
    case <-ctx.Done():
        return ctx.Err()
    default:
        // Continue processing
    }

    result, err := processPage(ctx, page)
    if err != nil {
        return fmt.Errorf("page %d: %w", i, err)
    }
}
```

---

### Issue 4: Memory Leaks with Large PDFs

**Symptom**: Memory usage grows unbounded, OOM errors

**Cause**: Loading entire PDF into memory, not cleaning up resources

**Solution**:
```go
// ❌ Wrong - loads everything into memory
func processPDF(path string) ([]byte, error) {
    data, err := os.ReadFile(path)  // Entire file in memory
    if err != nil {
        return nil, err
    }
    return processAllPages(data)
}

// ✅ Correct - stream processing
func processPDF(path string) (<-chan PageResult, <-chan error) {
    results := make(chan PageResult, 10)  // Buffered channel
    errors := make(chan error, 1)

    go func() {
        defer close(results)
        defer close(errors)

        // Process pages one at a time
        for pageNum := 0; pageNum < pageCount; pageNum++ {
            page, err := extractPage(path, pageNum)
            if err != nil {
                errors <- err
                return
            }

            results <- page

            // Clean up page resources immediately
            page = PageResult{}  // Allow GC
        }
    }()

    return results, errors
}
```

**Monitor Memory**:
```go
import "runtime"

func logMemoryUsage() {
    var m runtime.MemStats
    runtime.ReadMemStats(&m)
    log.Printf("Alloc = %v MiB, TotalAlloc = %v MiB, Sys = %v MiB, NumGC = %v",
        m.Alloc/1024/1024, m.TotalAlloc/1024/1024, m.Sys/1024/1024, m.NumGC)
}

// Call periodically during processing
go func() {
    ticker := time.NewTicker(10 * time.Second)
    defer ticker.Stop()

    for range ticker.C {
        logMemoryUsage()
    }
}()
```

---

### Issue 5: Gin Router Not Responding

**Symptom**: Server starts but requests timeout or return 404

**Cause**: Incorrect route registration or middleware blocking

**Solution**:
```go
// ❌ Wrong - middleware blocks all requests
router.Use(func(c *gin.Context) {
    // Missing c.Next()!
    log.Println("Request received")
})

// ✅ Correct - call Next()
router.Use(func(c *gin.Context) {
    log.Println("Request received")
    c.Next()  // Continue to next handler
})

// ✅ Better - use proper middleware pattern
router.Use(gin.Logger())
router.Use(gin.Recovery())

// Register routes AFTER middleware
router.POST("/parse/pdf", handlers.ParsePDF)
```

**Debugging Routes**:
```go
// Print all registered routes
for _, route := range router.Routes() {
    log.Printf("%s %s", route.Method, route.Path)
}

// Test route manually
router.POST("/test", func(c *gin.Context) {
    c.JSON(200, gin.H{"status": "ok"})
})
```

---

### Issue 6: Dependency Version Conflicts

**Symptom**: `go mod tidy` errors or build failures

**Cause**: Incompatible package versions

**Solution**:
```bash
# Update all dependencies
go get -u ./...
go mod tidy

# Update specific package
go get github.com/gin-gonic/gin@latest

# Pin specific version
go get github.com/gin-gonic/gin@v1.9.1

# Remove unused dependencies
go mod tidy -v

# Verify go.sum
go mod verify
```

**Check for Indirect Dependencies**:
```bash
# See why package is required
go mod why github.com/problematic/package

# See full dependency graph
go mod graph

# Clean module cache (if corrupted)
go clean -modcache
```

---

### Issue 7: File Upload Size Limits

**Symptom**: Large PDF uploads fail with connection reset

**Cause**: Default Gin body size limit (32MB) or reverse proxy limits

**Solution**:
```go
// Increase Gin's default body size
router.MaxMultipartMemory = 100 << 20  // 100 MB

// In handler - check file size
func ParsePDF(c *gin.Context) {
    file, header, err := c.Request.FormFile("file")
    if err != nil {
        c.JSON(400, gin.H{"error": "No file uploaded"})
        return
    }
    defer file.Close()

    // Check size limit (100MB)
    const maxSize = 100 * 1024 * 1024
    if header.Size > maxSize {
        c.JSON(413, gin.H{"error": "File too large (max 100MB)"})
        return
    }

    // Process file...
}
```

**Nginx Configuration** (if using reverse proxy):
```nginx
http {
    # Increase body size limit
    client_max_body_size 100M;

    # Increase timeouts for large uploads
    client_body_timeout 300s;
    proxy_read_timeout 300s;
}
```

---

## Performance Optimization

### Memory Management

```go
// ❌ Bad - keeps all pages in memory
func processPDFBad(pdfPath string) ([]Page, error) {
    var allPages []Page

    for i := 0; i < 1000; i++ {  // 1000 pages!
        text := extractPage(i)
        allPages = append(allPages, Page{Number: i, Text: text})
    }

    return allPages, nil
}

// ✅ Good - stream results
func processPDFGood(pdfPath string) (<-chan Page, <-chan error) {
    pages := make(chan Page)
    errors := make(chan error, 1)

    go func() {
        defer close(pages)
        defer close(errors)

        for i := 0; i < 1000; i++ {
            text := extractPage(i)
            pages <- Page{Number: i, Text: text}
        }
    }()

    return pages, errors
}
```

### Buffer Pooling

```go
import "sync"

var bufferPool = sync.Pool{
    New: func() interface{} {
        return new(bytes.Buffer)
    },
}

func processWithBuffer(data []byte) (string, error) {
    buf := bufferPool.Get().(*bytes.Buffer)
    defer func() {
        buf.Reset()
        bufferPool.Put(buf)
    }()

    // Use buffer
    buf.Write(data)

    return buf.String(), nil
}
```

---

## Deployment

### Dockerfile

```dockerfile
# Build stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache tesseract-ocr poppler-utils

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build
RUN CGO_ENABLED=0 GOOS=linux go build -o /doc-parser

# Runtime stage
FROM alpine:latest

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache tesseract-ocr poppler-utils

# Copy binary
COPY --from=builder /doc-parser /app/doc-parser

# Expose port
EXPOSE 8080

# Run
CMD ["/app/doc-parser"]
```

---

## Related Documentation

- [Architecture](architecture.md) - System architecture
- [Design Principles](design-principles.md) - Coding standards
- [Multi-Service](multiservice.md) - Service coordination

---

**Last Updated**: 2025-11-29
**Maintained By**: InsightSphere Parser Team
