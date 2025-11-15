package main

import (
	"log"
	"net/http"
)

func main() {
	server := NewChatServer()
	go server.Start()

	// Serve static files (HTML, CSS, JS)
	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", fs)

	// WebSocket endpoint
	http.HandleFunc("/ws", server.HandleWebSocket)

	// Start TCP server in a separate goroutine
	go func() {
		log.Println("TCP server starting on :8080")
		if err := server.Listen(":8080"); err != nil {
			log.Printf("TCP server error: %v", err)
		}
	}()

	// Start HTTP server for web UI
	log.Println("Web server starting on http://localhost:8000")
	log.Println("Open your browser and go to: http://localhost:8000")
	log.Fatal(http.ListenAndServe(":8000", nil))
}
