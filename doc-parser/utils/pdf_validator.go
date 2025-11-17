package utils

import (
	"fmt"
	"log"
	"os"
	"strings"
)

// ValidatePDFFile checks if the file exists, is not empty, and has .pdf extension
func ValidatePDFFile(filePath string) error {
	// Check if file exists
	fileInfo, err := os.Stat(filePath)
	if os.IsNotExist(err) {
		return fmt.Errorf("file not found: %s", filePath)
	}
	if err != nil {
		return fmt.Errorf("failed to stat file: %w", err)
	}

	// Check file size
	if fileInfo.Size() == 0 {
		return fmt.Errorf("file is empty: %s", filePath)
	}

	// Check file extension
	if !strings.HasSuffix(strings.ToLower(filePath), ".pdf") {
		return fmt.Errorf("file is not a PDF: %s", filePath)
	}

	log.Printf("📊 File validation passed: size=%d bytes", fileInfo.Size())
	return nil
}

// GetFileSize returns the size of a file in bytes, or 0 if error
func GetFileSize(filePath string) int64 {
	if info, err := os.Stat(filePath); err == nil {
		return info.Size()
	}
	return 0
}

