package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"strings"
	"sync"
	"time"
)

type Message struct {
	ID        string            `json:"id"`
	Type      string            `json:"type"` // "message", "system", "edit", "read_receipt"
	Author    string            `json:"author,omitempty"`
	Content   string            `json:"content"`
	Timestamp int64             `json:"timestamp"`
	ReplyTo   string            `json:"replyTo,omitempty"`   // ID of message being replied to
	Edited    bool              `json:"edited,omitempty"`
	ReadBy    map[string]int64  `json:"readBy,omitempty"`   // username -> timestamp
	ReplyToContent string       `json:"replyToContent,omitempty"` // Content of replied message
	ReplyToAuthor  string       `json:"replyToAuthor,omitempty"`   // Author of replied message
}

type Client struct {
	conn     net.Conn
	name     string
	outgoing chan string
}

type ChatServer struct {
	clients  map[*Client]bool
	messages map[string]*Message // Store messages by ID for replies and read receipts
	mu       sync.RWMutex
	join     chan *Client
	leave    chan *Client
	message  chan *Message
}

func NewChatServer() *ChatServer {
	return &ChatServer{
		clients:  make(map[*Client]bool),
		messages: make(map[string]*Message),
		join:     make(chan *Client),
		leave:    make(chan *Client),
		message:  make(chan *Message, 10),
	}
}

func (s *ChatServer) Start() {
	for {
		select {
		case client := <-s.join:
			s.mu.Lock()
			s.clients[client] = true
			s.mu.Unlock()
			log.Printf("%s joined the chat. Total clients: %d", client.name, len(s.clients))

		case client := <-s.leave:
			s.mu.Lock()
			if _, ok := s.clients[client]; ok {
				delete(s.clients, client)
				close(client.outgoing)
			}
			s.mu.Unlock()
			log.Printf("%s left the chat. Total clients: %d", client.name, len(s.clients))

		case msg := <-s.message:
			// Store message if it's a regular message
			if msg.Type == "message" {
				s.mu.Lock()
				s.messages[msg.ID] = msg
				s.mu.Unlock()
			}

			// Convert to JSON and broadcast
			msgJSON, err := json.Marshal(msg)
			if err != nil {
				log.Printf("Error marshaling message: %v", err)
				continue
			}

			s.mu.RLock()
			for client := range s.clients {
				select {
				case client.outgoing <- string(msgJSON):
				default:
					// Client buffer full, skip
				}
			}
			s.mu.RUnlock()
		}
	}
}

func (s *ChatServer) HandleConnection(conn net.Conn) {
	defer conn.Close()

	// Ask for username
	conn.Write([]byte("Enter your name: "))
	scanner := bufio.NewScanner(conn)
	if !scanner.Scan() {
		return
	}
	name := strings.TrimSpace(scanner.Text())
	if name == "" {
		name = conn.RemoteAddr().String()
	}

	client := &Client{
		conn:     conn,
		name:     name,
		outgoing: make(chan string, 10),
	}

	s.join <- client
	
	// Send join message
	joinMsg := &Message{
		ID:        fmt.Sprintf("sys_%d", time.Now().UnixNano()),
		Type:      "system",
		Content:   fmt.Sprintf("%s has joined the chat", client.name),
		Timestamp: time.Now().Unix(),
	}
	s.message <- joinMsg

	// Start goroutine to send messages to this client
	go func() {
		for msg := range client.outgoing {
			_, err := client.conn.Write([]byte(msg + "\n"))
			if err != nil {
				return
			}
		}
	}()

	// Read messages from client
	for scanner.Scan() {
		msg := scanner.Text()
		msg = strings.TrimSpace(msg)
		if msg == "" {
			continue
		}
		if msg == "/quit" {
			break
		}
		
		// Parse message - could be regular message, edit, or read receipt
		var messageData map[string]interface{}
		if err := json.Unmarshal([]byte(msg), &messageData); err == nil {
			// It's a JSON message
			msgType, _ := messageData["type"].(string)
			
			switch msgType {
			case "message":
				// New message or reply
				content, _ := messageData["content"].(string)
				replyTo, _ := messageData["replyTo"].(string)
				
				newMsg := &Message{
					ID:        fmt.Sprintf("msg_%d_%s", time.Now().UnixNano(), client.name),
					Type:      "message",
					Author:    client.name,
					Content:   content,
					Timestamp: time.Now().Unix(),
					ReadBy:    make(map[string]int64),
				}
				
				if replyTo != "" {
					s.mu.RLock()
					if replyMsg, exists := s.messages[replyTo]; exists {
						newMsg.ReplyTo = replyTo
						newMsg.ReplyToContent = replyMsg.Content
						newMsg.ReplyToAuthor = replyMsg.Author
					}
					s.mu.RUnlock()
				}
				
				s.message <- newMsg
				
			case "edit":
				// Edit existing message
				msgID, _ := messageData["id"].(string)
				newContent, _ := messageData["content"].(string)
				
				s.mu.Lock()
				if origMsg, exists := s.messages[msgID]; exists && origMsg.Author == client.name {
					origMsg.Content = newContent
					origMsg.Edited = true
					origMsg.Timestamp = time.Now().Unix() // Update timestamp
					
					editMsg := &Message{
						ID:        msgID,
						Type:      "edit",
						Author:    client.name,
						Content:   newContent,
						Timestamp: origMsg.Timestamp,
						Edited:    true,
					}
					s.mu.Unlock()
					
					s.message <- editMsg
				} else {
					s.mu.Unlock()
				}
				
			case "read_receipt":
				// Mark message as read
				msgID, _ := messageData["id"].(string)
				
				s.mu.Lock()
				if readMsg, exists := s.messages[msgID]; exists {
					readMsg.ReadBy[client.name] = time.Now().Unix()
					
					receiptMsg := &Message{
						ID:        msgID,
						Type:      "read_receipt",
						ReadBy:    readMsg.ReadBy,
					}
					s.mu.Unlock()
					
					s.message <- receiptMsg
				} else {
					s.mu.Unlock()
				}
			}
		} else {
			// Plain text message (backward compatibility)
			newMsg := &Message{
				ID:        fmt.Sprintf("msg_%d_%s", time.Now().UnixNano(), client.name),
				Type:      "message",
				Author:    client.name,
				Content:   msg,
				Timestamp: time.Now().Unix(),
				ReadBy:    make(map[string]int64),
			}
			s.message <- newMsg
		}
	}

	// Send leave message
	leaveMsg := &Message{
		ID:        fmt.Sprintf("sys_%d", time.Now().UnixNano()),
		Type:      "system",
		Content:   fmt.Sprintf("%s has left the chat", client.name),
		Timestamp: time.Now().Unix(),
	}
	s.message <- leaveMsg
	s.leave <- client
}

func (s *ChatServer) Listen(address string) error {
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return err
	}
	defer listener.Close()

	log.Printf("Chat server listening on %s", address)

	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Printf("Error accepting connection: %v", err)
			continue
		}
		go s.HandleConnection(conn)
	}
}
