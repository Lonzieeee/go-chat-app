package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

func (s *ChatServer) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	// Read username from first message
	_, msg, err := conn.ReadMessage()
	if err != nil {
		log.Printf("Error reading username: %v", err)
		return
	}
	name := strings.TrimSpace(string(msg))
	if name == "" {
		name = r.RemoteAddr
	}

	client := &Client{
		conn:     nil, // WebSocket doesn't use net.Conn
		name:     name,
		outgoing: make(chan string, 10),
	}

	s.join <- client
	
	// Send join message
	joinMsg := &Message{
		ID:        fmt.Sprintf("sys_%d", time.Now().UnixNano()),
		Type:      "system",
		Content:   client.name + " has joined the chat",
		Timestamp: time.Now().Unix(),
	}
	s.message <- joinMsg

	// Goroutine to send messages to this WebSocket client
	done := make(chan struct{})
	go func() {
		defer close(done)
		for msg := range client.outgoing {
			err := conn.WriteMessage(websocket.TextMessage, []byte(msg))
			if err != nil {
				log.Printf("WebSocket write error: %v", err)
				return
			}
		}
	}()

	// Read messages from WebSocket client
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}
		msg := strings.TrimSpace(string(message))
		if msg == "" {
			continue
		}
		if msg == "/quit" {
			break
		}
		
		// Parse message - could be regular message, edit, or read receipt
		var messageData map[string]interface{}
		if err := json.Unmarshal(message, &messageData); err == nil {
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
					origMsg.Timestamp = time.Now().Unix()
					
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
						ID:     msgID,
						Type:   "read_receipt",
						ReadBy: readMsg.ReadBy,
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
		Content:   client.name + " has left the chat",
		Timestamp: time.Now().Unix(),
	}
	s.message <- leaveMsg
	s.leave <- client
	<-done
}
