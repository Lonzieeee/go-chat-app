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

const maxMessageHistory = 200

var (
	defaultJoinCode = "MYGROUP123"
	validJoinCodes  = map[string]string{
		"MYGROUP123": "Main Room",
		"MYGROUP456": "Team Room",
	}
)

func sanitizeJoinCode(code string) string {
	code = strings.TrimSpace(strings.ToUpper(code))
	if code == "" {
		return defaultJoinCode
	}
	return code
}

func isAllowedJoinCode(code string) bool {
	_, ok := validJoinCodes[code]
	return ok
}

type Message struct {
	ID             string           `json:"id"`
	Type           string           `json:"type"` // "message", "system", "edit", "read_receipt"
	Author         string           `json:"author,omitempty"`
	Content        string           `json:"content"`
	Image          string           `json:"image,omitempty"`
	Timestamp      int64            `json:"timestamp"`
	ReplyTo        string           `json:"replyTo,omitempty"` // ID of message being replied to
	Edited         bool             `json:"edited,omitempty"`
	ReadBy         map[string]int64 `json:"readBy,omitempty"`         // username -> timestamp
	ReplyToContent string           `json:"replyToContent,omitempty"` // Content of replied message
	ReplyToAuthor  string           `json:"replyToAuthor,omitempty"`  // Author of replied message
	RoomCode       string           `json:"roomCode,omitempty"`
}
type Client struct {
	conn     net.Conn
	name     string
	outgoing chan string
	roomCode string
}

type ChatServer struct {
	clients  map[*Client]bool
	messages map[string]*Message // Store messages by ID for replies and read receipts
	history  map[string][]*Message
	mu       sync.RWMutex
	join     chan *Client
	leave    chan *Client
	message  chan *Message

	// Optional: restrict to specific member usernames
	allowedMembers map[string]bool
}

func NewChatServer() *ChatServer {
	return &ChatServer{
		clients:  make(map[*Client]bool),
		messages: make(map[string]*Message),
		history:  make(map[string][]*Message),
		join:     make(chan *Client),
		leave:    make(chan *Client),
		message:  make(chan *Message, 10),
		// TODO: put your real member names here; leave empty map to allow all
		allowedMembers: map[string]bool{},
	}
}

func (s *ChatServer) Start() {
	for {
		select {
		case client := <-s.join:
			s.mu.Lock()
			s.clients[client] = true
			s.mu.Unlock()
			log.Printf("%s joined the chat. Room: %s. Total clients: %d", client.name, client.roomCode, len(s.clients))
			s.sendHistoryToClient(client)
			s.broadcastStats(client.roomCode)

		case client := <-s.leave:
			s.mu.Lock()
			if _, ok := s.clients[client]; ok {
				delete(s.clients, client)
				// Only close channel if it's not nil (for websocket clients)
				if client.outgoing != nil {
					close(client.outgoing)
				}
			}
			s.mu.Unlock()
			log.Printf("%s left the chat. Room: %s. Total clients: %d", client.name, client.roomCode, len(s.clients))
			s.broadcastStats(client.roomCode)

		case msg := <-s.message:
			// Store message if it's a regular message
			if msg.Type == "message" {
				s.mu.Lock()
				s.messages[msg.ID] = msg
				roomHistory := append(s.history[msg.RoomCode], msg)
				if len(roomHistory) > maxMessageHistory {
					roomHistory = roomHistory[len(roomHistory)-maxMessageHistory:]
				}
				s.history[msg.RoomCode] = roomHistory
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
				if client.roomCode != msg.RoomCode || client.outgoing == nil {
					continue
				}
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

// broadcastStats sends current total members and online members to all clients in a room
func (s *ChatServer) broadcastStats(roomCode string) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	totalMembers := len(s.allowedMembers)
	if totalMembers == 0 {
		// If no fixed member list is configured, fall back to current clients count
		totalMembers = len(s.clients)
	}

	memberNames := make([]string, 0, len(s.clients))
	onlineCount := 0
	for client := range s.clients {
		if client.roomCode != roomCode {
			continue
		}
		memberNames = append(memberNames, client.name)
		onlineCount++
	}

	stats := map[string]interface{}{
		"type":          "stats",
		"totalMembers":  totalMembers,
		"onlineMembers": onlineCount,
		"memberNames":   memberNames,
	}

	msgJSON, err := json.Marshal(stats)
	if err != nil {
		log.Printf("Error marshaling stats: %v", err)
		return
	}

	for client := range s.clients {
		if client.roomCode != roomCode || client.outgoing == nil {
			continue
		}
		select {
		case client.outgoing <- string(msgJSON):
		default:
			// skip if client buffer is full
		}
	}
}

func (s *ChatServer) sendHistoryToClient(client *Client) {
	s.mu.RLock()
	roomHistory := s.history[client.roomCode]
	if len(roomHistory) == 0 {
		s.mu.RUnlock()
		return
	}
	historyCopy := make([]*Message, len(roomHistory))
	copy(historyCopy, roomHistory)
	s.mu.RUnlock()

	payload := map[string]interface{}{
		"type":     "history",
		"messages": historyCopy,
	}

	data, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Error marshaling history: %v", err)
		return
	}

	if client.outgoing != nil {
		select {
		case client.outgoing <- string(data):
		default:
			// drop history if client buffer full
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

	// ---- THIS IS THE FIX ----
	// Check for HTTP requests (like Render's health check)
	if name == "" || strings.HasPrefix(name, "HEAD /") || strings.HasPrefix(name, "GET /") || strings.HasPrefix(name, "User-Agent:") {
		log.Printf("Ignoring health check or empty connection from %s", conn.RemoteAddr())
		return // Just close the connection and do nothing
	}
	// ---- END OF FIX ----

	if name == "" {
		name = conn.RemoteAddr().String()
	}

	conn.Write([]byte("Enter join code (leave blank for default): "))
	roomCode := defaultJoinCode
	if scanner.Scan() {
		codeInput := sanitizeJoinCode(scanner.Text())
		if !isAllowedJoinCode(codeInput) {
			conn.Write([]byte("Invalid join code. Connection closed.\n"))
			return
		}
		roomCode = codeInput
	} else {
		return
	}

	client := &Client{
		conn:     conn,
		name:     name,
		outgoing: make(chan string, 10),
		roomCode: roomCode,
	}

	s.join <- client

	// Send join message
	joinMsg := &Message{
		ID:        fmt.Sprintf("sys_%d", time.Now().UnixNano()),
		Type:      "system",
		Content:   fmt.Sprintf("%s has joined the chat", client.name),
		Timestamp: time.Now().Unix(),
		RoomCode:  client.roomCode,
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
				imageData, _ := messageData["image"].(string)
				replyTo, _ := messageData["replyTo"].(string)

				newMsg := &Message{
					ID:        fmt.Sprintf("msg_%d_%s", time.Now().UnixNano(), client.name),
					Type:      "message",
					Author:    client.name,
					Content:   content,
					Image:     imageData,
					Timestamp: time.Now().Unix(),
					ReadBy:    make(map[string]int64),
					RoomCode:  client.roomCode,
				}

				if replyTo != "" {
					s.mu.RLock()
					if replyMsg, exists := s.messages[replyTo]; exists && replyMsg.RoomCode == client.roomCode {
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
				if origMsg, exists := s.messages[msgID]; exists && origMsg.Author == client.name && origMsg.RoomCode == client.roomCode {
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
						RoomCode:  client.roomCode,
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
				if readMsg, exists := s.messages[msgID]; exists && readMsg.RoomCode == client.roomCode {
					readMsg.ReadBy[client.name] = time.Now().Unix()

					receiptMsg := &Message{
						ID:       msgID,
						Type:     "read_receipt",
						ReadBy:   readMsg.ReadBy,
						RoomCode: client.roomCode,
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
				RoomCode:  client.roomCode,
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
		RoomCode:  client.roomCode,
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
