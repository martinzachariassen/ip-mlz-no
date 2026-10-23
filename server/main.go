package main

import (
	"log"
	"net"
	"net/http"
	"net/netip"
	"os"
	"strings"
	"time"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           newHandler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       5 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Fatal(srv.ListenAndServe())
}

func newHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/ip", handleIP)
	return mux
}

func handleIP(w http.ResponseWriter, r *http.Request) {
	h := w.Header()
	h.Set("Content-Type", "text/plain; charset=utf-8")

	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		h.Set("Allow", "GET, HEAD")
		w.WriteHeader(http.StatusMethodNotAllowed)
		_, _ = w.Write([]byte("method not allowed\n"))
		return
	}

	h.Set("Cache-Control", "no-store, private")
	h.Set("X-Robots-Tag", "noindex")

	addr, ok := clientAddr(r)
	if !ok {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte("error: could not determine address\n"))
		return
	}
	_, _ = w.Write([]byte(addr + "\n"))
}

// X-Forwarded-For is caller-controlled on the raw Cloud Run URL, so anything
// that isn't an address must not be echoed.
func clientAddr(r *http.Request) (string, bool) {
	raw := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-For"), ",")[0])
	if raw == "" {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			host = r.RemoteAddr
		}
		raw = host
	}
	addr, err := netip.ParseAddr(raw)
	if err != nil {
		return "", false
	}
	return addr.WithZone("").Unmap().String(), true
}
