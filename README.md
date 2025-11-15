# Go Chat Application

A real-time chat application built in Go that supports multiple clients connecting and chatting simultaneously.

## Features

- Multiple clients can connect and chat in real-time
- Broadcast messages to all connected clients
- Username support
- Join/leave notifications
- Simple command to quit: `/quit`
- Thread-safe using Go channels and mutexes

## Project Structure

```
go-chat-app/
├── main.go           # Server entry point
├── server.go         # Chat server core (TCP)
├── websocket.go      # WebSocket handler
├── client.go         # Terminal client (for testing)
├── static/
│   ├── index.html    # Web UI
│   ├── style.css     # Styles
│   └── app.js        # WebSocket client
├── go.mod            # Go module file
└── README.md         # This file
```

## How It Works

The server uses:
- **TCP sockets** for client connections
- **Goroutines** to handle multiple clients concurrently
- **Channels** for message broadcasting and client management
- **Mutexes** for thread-safe client map access

## Running the Application

### 1. Start the Server

```bash
cd ~/Documents/CODE/go-chat-app
go run main.go server.go websocket.go
```

The server will start:
- **Web UI** on `http://localhost:8000`
- **TCP server** on `localhost:8080` (for terminal clients)

### 2. Connect Clients

You have two options:

#### Option A: Web Browser (Recommended)

1. Open your browser and go to: `http://localhost:8000`
2. Enter your name
3. Start chatting!

You can open multiple browser tabs/windows to test multiple users.

#### Option B: Terminal Clients

**Using telnet:**
```bash
telnet localhost 8080
```

**Using netcat:**
```bash
nc localhost 8080
```

### 3. Chat!

- Enter your name when prompted
- Type messages and press Enter to send
- Messages are broadcast to all connected clients (both web and terminal)
- Type `/quit` to disconnect or click "Leave" button in web UI

## Quick Demo

**Start the server:**
```bash
cd ~/Documents/CODE/go-chat-app
go run main.go server.go websocket.go
```

**Connect multiple clients:**
- Open `http://localhost:8000` in multiple browser tabs
- Or mix web and terminal clients (telnet/netcat)
- All clients can see each other's messages in real-time

## Example Session

```
Terminal 1 (Alice):
Enter your name: Alice
*** Alice has joined the chat ***
Hello everyone!
[Alice]: Hello everyone!
*** Bob has joined the chat ***
[Bob]: Hi Alice!

Terminal 2 (Bob):
Enter your name: Bob
*** Alice has joined the chat ***
[Alice]: Hello everyone!
*** Bob has joined the chat ***
Hi Alice!
[Bob]: Hi Alice!
```

## Building Executables

To build a standalone binary:

```bash
# Build the application
go build -o chat-app main.go server.go websocket.go

# Run it
./chat-app
```

## Technical Details

- **Web UI Port**: 8000 (HTTP/WebSocket)
- **TCP Port**: 8080 (for terminal clients)
- **Protocols**: WebSocket for web clients, TCP for terminal clients
- **Concurrency**: Each client connection runs in its own goroutine
- **Message Format**: `[username]: message`
- **Frontend**: Vanilla JavaScript (no frameworks)
- **Backend**: Go with gorilla/websocket

## Extending the Application

Some ideas for improvements:
- Add private messaging
- Implement chat rooms/channels
- Add message history
- Support for emojis and formatting
- Authentication/authorization
- Persistent storage with a database
- Web interface using WebSockets

## Troubleshooting

### Port Already in Use

If you see "address already in use" errors, you can change the ports in `main.go`:
- Web UI: Change `:8000` to another port (e.g., `:3000`, `:8888`)
- TCP server: Change `:8080` to another port (e.g., `:9000`)

### WebSocket Connection Failed

Make sure:
1. The server is running
2. You're accessing `http://localhost:8000` (not `https://`)
3. No firewall is blocking the connection

## Requirements

- Go 1.21 or higher
- Modern web browser (Chrome, Firefox, Safari, Edge)

## License

MIT
