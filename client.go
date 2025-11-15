package main

import (
	"bufio"
	"fmt"
	"log"
	"net"
	"os"
	"strings"
)

func RunClient(address string) {
	conn, err := net.Dial("tcp", address)
	if err != nil {
		log.Fatalf("Failed to connect to server: %v", err)
	}
	defer conn.Close()

	fmt.Println("Connected to chat server!")
	fmt.Println("Type /quit to exit")
	fmt.Println()

	// Goroutine to read from server
	go func() {
		scanner := bufio.NewScanner(conn)
		for scanner.Scan() {
			fmt.Println(scanner.Text())
		}
		if err := scanner.Err(); err != nil {
			log.Printf("Connection error: %v", err)
		}
		os.Exit(0)
	}()

	// Read from stdin and send to server
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		msg := scanner.Text()
		msg = strings.TrimSpace(msg)
		
		_, err := conn.Write([]byte(msg + "\n"))
		if err != nil {
			log.Fatalf("Failed to send message: %v", err)
		}

		if msg == "/quit" {
			fmt.Println("Disconnected from server.")
			return
		}
	}

	if err := scanner.Err(); err != nil {
		log.Fatalf("Error reading input: %v", err)
	}
}
