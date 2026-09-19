# doc-parser

Go service that turns an uploaded file into text, one page at a time. Gin is its
only direct dependency; PDF rendering and OCR are external binaries.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/parse/pdf` | Renders each page to a greyscale PNG with `pdftoppm`, then runs `tesseract` over it |
| `POST` | `/parse/docx` | Reads `word/document.xml` out of the zip. No OCR |
| `POST` | `/parse/text` | `.txt` and `.md`, read as-is. No OCR |
| `GET` | `/info` | Supported formats and limits |
| `GET` | `/health` | Liveness |

Only PDF pays for OCR. DOCX and plain text finish in under a second, and neither
records page breaks, so their citations name the file without a page number.

`OCR_LANGUAGES` selects the tesseract language data, default `eng`. The image
also ships Indonesian, so `eng+ind` works without rebuilding.

The service has no authentication and will OCR any path it is handed, so it is
reachable only from the API on the internal network and is never published to
the host in production.

```bash
go run main.go        # needs pdftoppm and tesseract on PATH
go test ./...
```
