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

	// Read join info (username + join code) from first message
	_, msg, err := conn.ReadMessage()
	if err != nil {
		log.Printf("Error reading join info: %v", err)
		return
	}

	var joinData struct {
		Type string `json:"type"`
		Name string `json:"name"`
		Code string `json:"code"`
	}

	name := ""

	// Require a proper JSON join message
	if err := json.Unmarshal(msg, &joinData); err != nil || joinData.Type != "join" {
		log.Printf("Invalid join message from %s", r.RemoteAddr)
		conn.WriteMessage(websocket.TextMessage, []byte("Invalid join message"))
		return
	}

	roomCode := sanitizeJoinCode(joinData.Code)
	if !isAllowedJoinCode(roomCode) {
		log.Printf("Invalid join code from %s", r.RemoteAddr)
		conn.WriteMessage(websocket.TextMessage, []byte("Invalid join code"))
		return
	}

	name = strings.TrimSpace(joinData.Name)

	if name == "" {
		name = r.RemoteAddr
	}

	// Optional: restrict to specific allowed members if configured
	if s.allowedMembers != nil && len(s.allowedMembers) > 0 {
		if !s.allowedMembers[name] {
			log.Printf("Rejected user %s: not in allowedMembers", name)
			conn.WriteMessage(websocket.TextMessage, []byte("You are not a member of this chat"))
			return
		}
	}

	client := &Client{
		conn:     nil, // WebSocket doesn't use net.Conn
		name:     name,
		outgoing: make(chan string, 10),
		roomCode: roomCode,
	}

	s.join <- client

	// Send join message
	joinMsg := &Message{
		ID:        fmt.Sprintf("sys_%d", time.Now().UnixNano()),
		Type:      "system",
		Content:   client.name + " has joined the chat",
		Timestamp: time.Now().Unix(),
		RoomCode:  client.roomCode,
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
					origMsg.Timestamp = time.Now().Unix()

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
		Content:   client.name + " has left the chat",
		Timestamp: time.Now().Unix(),
		RoomCode:  client.roomCode,
	}
	s.message <- leaveMsg
	s.leave <- client
	<-done
}
