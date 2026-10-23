package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func do(method, remote string, hdr map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, "/ip", nil)
	req.RemoteAddr = remote
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	newHandler().ServeHTTP(rec, req)
	return rec
}

func TestEchoesForwardedAddress(t *testing.T) {
	cases := []struct{ name, remote, xff, want string }{
		{"socket peer", "198.51.100.7:1234", "", "198.51.100.7\n"},
		{"ipv6 socket peer", "[2001:db8::1]:1234", "", "2001:db8::1\n"},
		{"first forwarded entry", "198.51.100.7:1", "203.0.113.9, 10.0.0.1", "203.0.113.9\n"},
		{"ipv6 forwarded", "198.51.100.7:1", "2001:db8::1", "2001:db8::1\n"},
		{"mapped ipv4 is unwrapped", "198.51.100.7:1", "::ffff:198.51.100.7", "198.51.100.7\n"},
	}
	for _, c := range cases {
		hdr := map[string]string{}
		if c.xff != "" {
			hdr["X-Forwarded-For"] = c.xff
		}
		rec := do("GET", c.remote, hdr)
		if rec.Code != 200 || rec.Body.String() != c.want {
			t.Errorf("%s: %d %q, want %q", c.name, rec.Code, rec.Body.String(), c.want)
		}
	}
}

func TestHeaders(t *testing.T) {
	rec := do("GET", "198.51.100.7:1", nil)
	for k, want := range map[string]string{
		"Cache-Control": "no-store, private",
		"X-Robots-Tag":  "noindex",
	} {
		if got := rec.Header().Get(k); got != want {
			t.Errorf("%s = %q, want %q", k, got, want)
		}
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/plain") {
		t.Errorf("content-type %q", ct)
	}
}

func TestRejectsNonAddresses(t *testing.T) {
	for _, v := range []string{"nope", "<script>", "1.2.3.4.5", "999.1.1.1"} {
		rec := do("GET", "198.51.100.7:1", map[string]string{"X-Forwarded-For": v})
		if rec.Code != 502 || strings.Contains(rec.Body.String(), v) {
			t.Errorf("xff %q: %d %q", v, rec.Code, rec.Body.String())
		}
	}
}

func TestMethods(t *testing.T) {
	if rec := do("HEAD", "198.51.100.7:1", nil); rec.Code != 200 {
		t.Errorf("HEAD: %d", rec.Code)
	}
	rec := do("POST", "198.51.100.7:1", nil)
	if rec.Code != http.StatusMethodNotAllowed || rec.Header().Get("Allow") != "GET, HEAD" {
		t.Errorf("POST: %d allow=%q", rec.Code, rec.Header().Get("Allow"))
	}
}
