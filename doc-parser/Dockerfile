FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    git

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Ensure go.sum is up to date and download any new dependencies
RUN go mod tidy && go mod download

# Build the application (CGO disabled since we use command-line tools)
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o doc-parser .

FROM alpine:latest

# Install runtime dependencies for OCR and PDF processing
RUN apk --no-cache add \
    ca-certificates \
    tzdata \
    tesseract-ocr \
    tesseract-ocr-data-eng \
    poppler-utils \
    leptonica

WORKDIR /root/

# Copy the binary from builder stage
COPY --from=builder /app/doc-parser .

# Create temp directory for image processing
RUN mkdir -p /tmp/pdf_processing

# Expose port
EXPOSE 8080

# Run the binary
CMD ["./doc-parser"] 