package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func init() { gin.SetMode(gin.TestMode) }

func do(t *testing.T, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, path, nil)
	} else {
		r = httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	NewRouter().ServeHTTP(w, r)
	return w
}

func TestHealth(t *testing.T) {
	w := do(t, http.MethodGet, "/health", "")
	if w.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", w.Code)
	}
	var got map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("body is not json: %v", err)
	}
	if got["status"] != "healthy" {
		t.Errorf("status = %v, want healthy", got["status"])
	}
}

// The API dispatches .docx to /parse/docx. That route does not exist, so the
// mismatch should stay visible rather than being discovered in production.
func TestDocxRouteIsNotRegistered(t *testing.T) {
	w := do(t, http.MethodPost, "/parse/docx", `{"filePath":"/tmp/x.docx"}`)
	if w.Code != http.StatusNotFound {
		t.Fatalf("got %d, want 404 — if this now passes, update the API dispatch and /info", w.Code)
	}
}

func TestInfoListsOnlySupportedFormats(t *testing.T) {
	w := do(t, http.MethodGet, "/info", "")
	if w.Code != http.StatusOK {
		t.Fatalf("got %d, want 200", w.Code)
	}
	var got struct {
		Formats []string `json:"formats"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	// /info must not advertise a format the router cannot serve.
	for _, f := range got.Formats {
		path := "/parse/" + f
		if do(t, http.MethodPost, path, `{"filePath":"/tmp/x"}`).Code == http.StatusNotFound {
			t.Errorf("/info advertises %q but %s is not routed", f, path)
		}
	}
}

func TestParsePDFRejectsBadRequests(t *testing.T) {
	cases := []struct {
		name string
		body string
	}{
		{"empty object", `{}`},
		{"empty path", `{"filePath":""}`},
		{"malformed json", `{`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := do(t, http.MethodPost, "/parse/pdf", c.body).Code; got != http.StatusBadRequest {
				t.Errorf("got %d, want 400", got)
			}
		})
	}
}

func TestParsePDFRejectsMissingFile(t *testing.T) {
	// Validation must reject the path before any OCR tooling is invoked.
	w := do(t, http.MethodPost, "/parse/pdf", `{"filePath":"/tmp/definitely-not-here.pdf"}`)
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("got %d, want 500", w.Code)
	}
	if !strings.Contains(w.Body.String(), "file not found") {
		t.Errorf("expected a file-not-found error, got %s", w.Body.String())
	}
}
