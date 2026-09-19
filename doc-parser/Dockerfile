FROM golang:1.24-alpine AS builder

WORKDIR /app

# Dependencies first so a source-only change reuses this layer.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO off: extraction shells out to pdftoppm and tesseract rather than linking.
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o doc-parser .

# Pinned. On :latest the OCR toolchain can change between rebuilds, which
# changes extraction output with nothing in the repo to explain why.
FROM alpine:3.22

# ttf-liberation and font-noto are not decoration. This image shipped with no
# fonts at all, and most academic PDFs reference Times New Roman or Arial
# without embedding them. With nothing to substitute, pdftoppm renders those
# glyphs as blank space, so OCR reads an empty page and the document arrives
# with no text. Measured on a 14 page article: 10 pages came back empty and
# the rest gave 55 to 100 characters. With fonts present the same page renders
# in full and OCR reads it correctly.
RUN apk --no-cache add \
    ca-certificates \
    tzdata \
    tesseract-ocr \
    tesseract-ocr-data-eng \
    tesseract-ocr-data-ind \
    poppler-utils \
    leptonica \
    ttf-liberation \
    font-noto

RUN adduser -D -u 10001 parser
WORKDIR /home/parser

COPY --from=builder /app/doc-parser .

# The service only reads PDFs handed to it and writes to a temp dir; it has no
# reason to run as root.
USER parser

EXPOSE 8080

CMD ["./doc-parser"]
