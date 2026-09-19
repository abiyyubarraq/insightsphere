package handlers

import (
	"archive/zip"
	"encoding/xml"
	"fmt"
	"io"
	"path/filepath"
	"strings"
)

// A .docx is a zip archive; the body text lives in this entry.
const docxBodyPath = "word/document.xml"

// Refuse anything implausible before allocating for it. A text-only document
// this large is not something the rest of the pipeline should try to embed.
const maxDocxBodyBytes = 64 << 20

// ParseDOCX extracts the text of a .docx file.
//
// Unlike a PDF there is no OCR step and no rendering: the text is already in
// the file. It also has no pages — pagination is computed by the word
// processor at display time and is not recorded in the document — so everything
// is returned as a single PageData. Citations for a DOCX therefore name the
// file but not a page, which is why the page number is optional downstream.
func ParseDOCX(filePath string) ([]PageData, map[string]interface{}, error) {
	reader, err := zip.OpenReader(filePath)
	if err != nil {
		return nil, nil, fmt.Errorf("not a readable docx (%s): %w", filepath.Base(filePath), err)
	}
	defer reader.Close()

	var body *zip.File
	for _, f := range reader.File {
		if f.Name == docxBodyPath {
			body = f
			break
		}
	}
	if body == nil {
		return nil, nil, fmt.Errorf("%s is missing %s; it may be a .doc renamed to .docx", filepath.Base(filePath), docxBodyPath)
	}
	if body.UncompressedSize64 > maxDocxBodyBytes {
		return nil, nil, fmt.Errorf("document body is %d bytes, over the %d limit", body.UncompressedSize64, maxDocxBodyBytes)
	}

	rc, err := body.Open()
	if err != nil {
		return nil, nil, fmt.Errorf("failed to open %s: %w", docxBodyPath, err)
	}
	defer rc.Close()

	text, err := extractDocxText(io.LimitReader(rc, maxDocxBodyBytes))
	if err != nil {
		return nil, nil, err
	}

	if strings.TrimSpace(text) == "" {
		return nil, nil, fmt.Errorf("no text found in %s; it may contain only images, which this service does not OCR", filepath.Base(filePath))
	}

	pages := []PageData{{PageNumber: 1, Text: text}}
	meta := map[string]interface{}{
		"fileName":         filepath.Base(filePath),
		"fileType":         "docx",
		"pages":            1,
		"successfulPages":  1,
		"failedPages":      0,
		"extractionMethod": "docx-xml",
		"textLength":       len(text),
		// Stated so nobody reads the single page as a failed multi-page parse.
		"pagination": "none; docx does not record page breaks",
	}
	return pages, meta, nil
}

// extractDocxText walks the document body and reconstructs readable text.
//
// Streaming rather than unmarshalling into a struct: the schema has dozens of
// element types and only a handful carry text, so decoding the whole tree would
// cost far more than it returns.
func extractDocxText(r io.Reader) (string, error) {
	decoder := xml.NewDecoder(r)

	var out strings.Builder
	var paragraph strings.Builder
	// Only w:t carries visible text. Everything else in the body is markup, and
	// the whitespace between those tags is formatting, not content.
	inText := false
	// Deleted text sits in w:delText inside tracked changes and must not appear.
	skipDepth := 0

	flush := func() {
		if line := strings.TrimSpace(paragraph.String()); line != "" {
			out.WriteString(line)
			out.WriteString("\n")
		}
		paragraph.Reset()
	}

	for {
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", fmt.Errorf("malformed document xml: %w", err)
		}

		switch t := token.(type) {
		case xml.StartElement:
			if skipDepth > 0 {
				skipDepth++
				continue
			}
			switch t.Name.Local {
			case "t":
				inText = true
			case "delText", "instrText":
				skipDepth = 1
			case "tab":
				paragraph.WriteString("\t")
			case "br", "cr":
				paragraph.WriteString("\n")
			}

		case xml.EndElement:
			if skipDepth > 0 {
				skipDepth--
				continue
			}
			switch t.Name.Local {
			case "t":
				inText = false
			case "p":
				flush()
			case "tc":
				// End of a table cell: keep columns apart rather than running
				// them into one word.
				paragraph.WriteString("\t")
			case "tr":
				flush()
			}

		case xml.CharData:
			if inText && skipDepth == 0 {
				paragraph.Write(t)
			}
		}
	}
	flush()

	return strings.TrimSpace(out.String()), nil
}
