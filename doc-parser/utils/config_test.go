package utils

import "testing"

func TestOCRLanguages(t *testing.T) {
	t.Run("defaults to english", func(t *testing.T) {
		t.Setenv("OCR_LANGUAGES", "")
		if got := OCRLanguages(); got != "eng" {
			t.Errorf("got %q, want eng", got)
		}
	})

	t.Run("honours the env var", func(t *testing.T) {
		t.Setenv("OCR_LANGUAGES", "eng+ind")
		if got := OCRLanguages(); got != "eng+ind" {
			t.Errorf("got %q, want eng+ind", got)
		}
	})
}

func TestOCRDPI(t *testing.T) {
	cases := []struct {
		name string
		env  string
		want int
	}{
		{"unset falls back", "", 300},
		{"valid value", "200", 200},
		// A bad value must not silently render at something unusable.
		{"not a number", "abc", 300},
		{"below the floor", "10", 300},
		{"above the ceiling", "5000", 300},
		{"negative", "-100", 300},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Setenv("OCR_DPI", c.env)
			if got := OCRDPI(); got != c.want {
				t.Errorf("OCR_DPI=%q gave %d, want %d", c.env, got, c.want)
			}
		})
	}
}
