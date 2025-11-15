let ws = null;
let username = '';
let replyingTo = null; // ID of message being replied to
let editingMessageId = null; // ID of message being edited
let messages = new Map(); // Store messages by ID

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const messagesDiv = document.getElementById('messages');
const currentUserSpan = document.getElementById('current-user');
const leaveBtn = document.getElementById('leave-btn');
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');
const emojiGrid = document.getElementById('emoji-grid');
const imageBtn = document.getElementById('image-btn');
const imageInput = document.getElementById('image-input');
const imagePreview = document.getElementById('image-preview');
let selectedImage = null;

// Event Listeners
joinBtn.addEventListener('click', joinChat);
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinChat();
});

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

leaveBtn.addEventListener('click', leaveChat);

// Image upload functionality
if (imageBtn && imageInput) {
    imageBtn.addEventListener('click', () => {
        imageInput.click();
    });
    
    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            handleImageSelect(file);
        }
    });
}

// Emoji functionality - initialize when available
function initEmojiPicker() {
    const btn = document.getElementById('emoji-btn');
    const picker = document.getElementById('emoji-picker');
    const grid = document.getElementById('emoji-grid');
    
    if (!btn || !picker || !grid) {
        console.log('Emoji elements not ready yet');
        return false;
    }
    
    // Only add listener if not already added
    if (!btn.hasAttribute('data-emoji-initialized')) {
        btn.setAttribute('data-emoji-initialized', 'true');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            toggleEmojiPicker();
        });
    }
    
    // Initialize emoji picker if not already done
    if (!grid.hasAttribute('data-emoji-initialized')) {
        grid.setAttribute('data-emoji-initialized', 'true');
        initializeEmojis();
    }
    
    return true;
}

// Try to initialize immediately, or wait for DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEmojiPicker);
} else {
    initEmojiPicker();
}

// Also try when chat screen becomes visible
const chatScreenObserver = new MutationObserver(() => {
    if (!chatScreen.classList.contains('hidden') && emojiPicker && emojiPicker.classList.contains('hidden')) {
        if (!emojiGrid.innerHTML) {
            initEmojiPicker();
        }
    }
});

if (chatScreen) {
    chatScreenObserver.observe(chatScreen, { attributes: true, attributeFilter: ['class'] });
}

function joinChat() {
    const name = usernameInput.value.trim();
    if (name === '') {
        alert('Please enter your name');
        return;
    }

    username = name;
    
    // Connect to WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('Connected to chat server');
        // Send username as first message
        ws.send(username);
        
        // Switch to chat screen
        loginScreen.classList.add('hidden');
        chatScreen.classList.remove('hidden');
        currentUserSpan.textContent = username;
        
        // Initialize emoji picker when chat screen is shown
        setTimeout(() => {
            initEmojiPicker();
        }, 100);
        
        // Set user avatar with first letter
        const userAvatar = document.getElementById('user-avatar');
        userAvatar.textContent = username.charAt(0).toUpperCase();
        
        // Update header title to show user's name
        const headerTitle = document.querySelector('.chat-header h2');
        if (headerTitle) {
            headerTitle.textContent = username;
        }
        
        // Create proper header structure for avatar + name on top, status below
        const headerInfo = document.querySelector('.header-info');
        if (headerInfo && userAvatar) {
            // Create wrapper for avatar and name
            const headerTop = document.createElement('div');
            headerTop.classList.add('header-top');
            
            // Move avatar to the new wrapper
            headerTop.appendChild(userAvatar);
            
            // Move the h2 (name) to the wrapper
            const nameElement = headerInfo.querySelector('h2');
            if (nameElement) {
                headerTop.appendChild(nameElement);
            }
            
            // Insert the wrapper at the beginning of header-info
            headerInfo.insertBefore(headerTop, headerInfo.firstChild);
        }
        
        messageInput.focus();
    };

    ws.onmessage = (event) => {        const data = event.data.trim();
        
        // Try to parse as JSON first
        try {
            const message = JSON.parse(data);
            // Validate message has required fields
            if (message && message.type) {
                handleMessage(message);
                return;
            }
        } catch (e) {
            // Not JSON, continue to check old format
        }
        
        // Check if it's the old format with JSON inside (e.g., "[user]: {...}")
        const oldFormatMatch = data.match(/^\[(.+?)\]:\s*(.+)$/);
        if (oldFormatMatch) {
            const author = oldFormatMatch[1];
            const content = oldFormatMatch[2];
            
            // Try to parse the content as JSON
            try {
                const jsonContent = JSON.parse(content);
                if (jsonContent && jsonContent.type) {
                    // It's JSON wrapped in old format - extract and use it
                    jsonContent.author = author;
                    if (!jsonContent.id) jsonContent.id = 'msg_' + Date.now() + '_' + author;
                    if (!jsonContent.timestamp) jsonContent.timestamp = Math.floor(Date.now() / 1000);
                    handleMessage(jsonContent);
                    return;
                }
            } catch (e) {
                // Content is not JSON, treat as plain text
            }
            
            // Plain text in old format
            const plainMsg = {
                id: 'msg_' + Date.now() + '_' + author,
                type: 'message',
                author: author,
                content: content,
                timestamp: Math.floor(Date.now() / 1000),
                readBy: {}
            };
            handleMessage(plainMsg);
            return;
        }
        
        // Check if it's a system message (old format)
        if (data.startsWith('***') && data.endsWith('***')) {
            const systemMsg = {
                id: 'sys_' + Date.now(),
                type: 'system',
                content: data.replace(/\*\*\*/g, '').trim(),
                timestamp: Math.floor(Date.now() / 1000)
            };
            handleMessage(systemMsg);
            return;
        }
        
        // Fallback: display as plain text
        displayMessage(data);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        alert('Failed to connect to chat server');
    };

    ws.onclose = () => {
        console.log('Disconnected from chat server');
        if (!chatScreen.classList.contains('hidden')) {
            addSystemMessage('Disconnected from server');
        }
    };
}

function sendMessage() {
    const message = messageInput.value.trim();
    const hasImage = selectedImage !== null;
    
    // Need either message text or image
    if ((message === '' && !hasImage) || !ws || ws.readyState !== WebSocket.OPEN) {
        return;
    }

    if (editingMessageId) {
        // Edit existing message (images not supported for edits)
        ws.send(JSON.stringify({
            type: 'edit',
            id: editingMessageId,
            content: message
        }));
        editingMessageId = null;
        document.querySelector('.reply-preview')?.remove();
    } else {
        // Send new message or reply
        const messageObj = {
            type: 'message',
            content: message || ''
        };
        
        // Add image if selected
        if (hasImage) {
            messageObj.image = selectedImage;
            selectedImage = null;
            clearImagePreview();
        }
        
        if (replyingTo) {
            messageObj.replyTo = replyingTo;
            replyingTo = null;
            document.querySelector('.reply-preview')?.remove();
        }
        
        ws.send(JSON.stringify(messageObj));
    }
    
    messageInput.value = '';
    messageInput.focus();
    updateInputPlaceholder();
}

function handleImageSelect(file) {
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
        alert('Image is too large. Please select an image smaller than 10MB.');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        compressImage(e.target.result, (compressed) => {
            selectedImage = compressed;
            showImagePreview(compressed);
        });
    };
    reader.readAsDataURL(file);
}

function compressImage(dataUrl, callback) {
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxWidth = 1200;
        const maxHeight = 1200;
        const quality = 0.8;
        
        // Calculate new dimensions
        if (width > height) {
            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }
        } else {
            if (height > maxHeight) {
                width = (width * maxHeight) / height;
                height = maxHeight;
            }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to base64 with compression
        const compressed = canvas.toDataURL('image/jpeg', quality);
        callback(compressed);
    };
    img.src = dataUrl;
}

function showImagePreview(imageData) {
    if (!imagePreview) return;
    
    const previewContent = document.createElement('div');
    previewContent.classList.add('image-preview-content');
    
    const img = document.createElement('img');
    img.src = imageData;
    img.alt = 'Preview';
    previewContent.appendChild(img);
    
    const closeBtn = document.createElement('button');
    closeBtn.classList.add('image-preview-close');
    closeBtn.textContent = '×';
    closeBtn.onclick = clearImagePreview;
    previewContent.appendChild(closeBtn);
    
    imagePreview.innerHTML = '';
    imagePreview.appendChild(previewContent);
    imagePreview.classList.remove('hidden');
}

function clearImagePreview() {
    if (imagePreview) {
        imagePreview.innerHTML = '';
        imagePreview.classList.add('hidden');
    }
    if (imageInput) {
        imageInput.value = '';
    }
    selectedImage = null;
}

// Make it globally accessible
window.clearImagePreview = clearImagePreview;

function updateInputPlaceholder() {
    if (editingMessageId) {
        messageInput.placeholder = 'Edit your message...';
    } else if (replyingTo) {
        messageInput.placeholder = 'Type your reply...';
    } else {
        messageInput.placeholder = 'Type your message...';
    }
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'system':
            displaySystemMessage(msg);
            break;
        case 'message':
            displayUserMessage(msg);
            // Mark as read
            setTimeout(() => markAsRead(msg.id), 500);
            break;
        case 'edit':
            updateMessage(msg);
            break;
        case 'read_receipt':
            updateReadReceipts(msg);
            break;
        default:
            displaySystemMessage(msg);
    }
}

function displaySystemMessage(msg) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'system');
    messageDiv.textContent = msg.content;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function displayUserMessage(msg) {
    // Ensure required fields exist
    if (!msg.id) {
        msg.id = 'msg_' + Date.now() + '_' + (msg.author || 'unknown');
    }
    if (!msg.author) {
        msg.author = 'Unknown';
    }
    if (!msg.timestamp) {
        msg.timestamp = Math.floor(Date.now() / 1000);
    }
    if (!msg.readBy) {
        msg.readBy = {};
    }
    
    // Store message
    messages.set(msg.id, msg);
    
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    messageDiv.dataset.messageId = msg.id;
    
    if (msg.author === username) {
        messageDiv.classList.add('own');
    } else {
        messageDiv.classList.add('other');
        // Show author name for other's messages
        const authorSpan = document.createElement('div');
        authorSpan.classList.add('message-author');
        authorSpan.textContent = msg.author;
        messageDiv.appendChild(authorSpan);
    }
    
    // Reply preview if this is a reply
    if (msg.replyTo) {
        const replyPreview = document.createElement('div');
        replyPreview.classList.add('reply-preview', 'clickable');
        replyPreview.title = 'Click to jump to original message';
        replyPreview.onclick = () => jumpToMessage(msg.replyTo);
        
        const replyAuthor = document.createElement('span');
        replyAuthor.classList.add('reply-author');
        replyAuthor.textContent = msg.replyToAuthor === username ? 'You' : msg.replyToAuthor;
        replyPreview.appendChild(replyAuthor);
        
        const replyContent = document.createElement('span');
        replyContent.classList.add('reply-content');
        replyContent.textContent = msg.replyToContent;
        replyPreview.appendChild(replyContent);
        
        // Add arrow indicator
        const arrowIcon = document.createElement('span');
        arrowIcon.classList.add('reply-arrow');
        arrowIcon.innerHTML = '↗';
        replyPreview.appendChild(arrowIcon);
        
        messageDiv.appendChild(replyPreview);
    }
    
    // Image if present
    if (msg.image) {
        const imageDiv = document.createElement('div');
        imageDiv.classList.add('message-image');
        const img = document.createElement('img');
        img.src = msg.image;
        img.alt = 'Shared image';
        img.loading = 'lazy';
        img.onclick = () => {
            // Open image in new window for full view
            const newWindow = window.open();
            newWindow.document.write(`<img src="${msg.image}" style="max-width: 100%; height: auto;">`);
        };
        imageDiv.appendChild(img);
        messageDiv.appendChild(imageDiv);
    }
    
    // Message content (only if there's text)
    if (msg.content && msg.content.trim() !== '') {
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('message-content');
        contentDiv.textContent = msg.content;
        messageDiv.appendChild(contentDiv);
    }
    
    // Message metadata
    const metaDiv = document.createElement('div');
    metaDiv.classList.add('message-meta');
    
    // Timestamp
    const timeSpan = document.createElement('span');
    timeSpan.classList.add('message-time');
    timeSpan.textContent = msg.timestamp ? formatTime(msg.timestamp) : 'just now';
    metaDiv.appendChild(timeSpan);
    
    // Edited indicator
    if (msg.edited) {
        const editedSpan = document.createElement('span');
        editedSpan.classList.add('edited-indicator');
        editedSpan.textContent = 'edited';
        metaDiv.appendChild(editedSpan);
    }
    
    // Read receipts (only for own messages)
    if (msg.author === username && msg.readBy) {
        const readReceipt = document.createElement('span');
        readReceipt.classList.add('read-receipt');
        const readCount = Object.keys(msg.readBy).filter(u => u !== username).length;
        if (readCount > 0) {
            readReceipt.innerHTML = '✓✓';
            readReceipt.title = `Read by ${readCount} ${readCount === 1 ? 'person' : 'people'}`;
            readReceipt.classList.add('read');
        } else {
            readReceipt.innerHTML = '✓';
            readReceipt.title = 'Sent';
            readReceipt.classList.add('sent');
        }
        metaDiv.appendChild(readReceipt);
    }
    
    messageDiv.appendChild(metaDiv);
    
    // Action buttons
    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('message-actions');
    
    // Reply button (for other's messages)
    if (msg.author !== username) {
        const replyBtn = document.createElement('button');
        replyBtn.classList.add('action-btn', 'reply-btn');
        replyBtn.innerHTML = '↩';
        replyBtn.title = 'Reply';
        replyBtn.onclick = () => replyToMessage(msg.id);
        actionsDiv.appendChild(replyBtn);
    }
    
    // Edit button (for own messages)
    if (msg.author === username) {
        const editBtn = document.createElement('button');
        editBtn.classList.add('action-btn', 'edit-btn');
        editBtn.innerHTML = '✎';
        editBtn.title = 'Edit';
        editBtn.onclick = () => editMessage(msg.id);
        actionsDiv.appendChild(editBtn);
    }
    
    messageDiv.appendChild(actionsDiv);
    
    // Check if message already exists (for updates)
    const existing = messagesDiv.querySelector(`[data-message-id="${msg.id}"]`);
    if (existing) {
        existing.replaceWith(messageDiv);
    } else {
        messagesDiv.appendChild(messageDiv);
    }
    
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function updateMessage(msg) {
    const messageDiv = messagesDiv.querySelector(`[data-message-id="${msg.id}"]`);
    if (messageDiv) {
        const contentDiv = messageDiv.querySelector('.message-content');
        if (contentDiv) {
            contentDiv.textContent = msg.content;
        }
        
        // Update edited indicator
        let editedSpan = messageDiv.querySelector('.edited-indicator');
        if (!editedSpan) {
            editedSpan = document.createElement('span');
            editedSpan.classList.add('edited-indicator');
            const metaDiv = messageDiv.querySelector('.message-meta');
            if (metaDiv) {
                metaDiv.insertBefore(editedSpan, metaDiv.firstChild.nextSibling);
            }
        }
        editedSpan.textContent = 'edited';
        
        // Update stored message
        if (messages.has(msg.id)) {
            const storedMsg = messages.get(msg.id);
            storedMsg.content = msg.content;
            storedMsg.edited = true;
        }
    }
}

function updateReadReceipts(msg) {
    const messageDiv = messagesDiv.querySelector(`[data-message-id="${msg.id}"]`);
    if (messageDiv && msg.readBy) {
        const readReceipt = messageDiv.querySelector('.read-receipt');
        if (readReceipt) {
            const readCount = Object.keys(msg.readBy).filter(u => u !== username).length;
            if (readCount > 0) {
                readReceipt.innerHTML = '✓✓';
                readReceipt.title = `Read by ${readCount} ${readCount === 1 ? 'person' : 'people'}`;
                readReceipt.classList.remove('sent');
                readReceipt.classList.add('read');
            }
        }
        
        // Update stored message
        if (messages.has(msg.id)) {
            messages.get(msg.id).readBy = msg.readBy;
        }
    }
}

function replyToMessage(messageId) {
    const msg = messages.get(messageId);
    if (!msg) return;
    
    replyingTo = messageId;
    editingMessageId = null;
    
    // Show reply preview
    const existingPreview = document.querySelector('.reply-preview');
    if (existingPreview) existingPreview.remove();
    
    const preview = document.createElement('div');
    preview.classList.add('reply-preview');
    const author = document.createElement('span');
    author.classList.add('reply-author');
    author.textContent = msg.author === username ? 'You' : msg.author;
    preview.appendChild(author);
    const content = document.createElement('span');
    content.classList.add('reply-content');
    content.textContent = msg.content;
    preview.appendChild(content);
    
    const closeBtn = document.createElement('button');
    closeBtn.classList.add('reply-close');
    closeBtn.innerHTML = '×';
    closeBtn.onclick = () => {
        replyingTo = null;
        preview.remove();
        updateInputPlaceholder();
    };
    preview.appendChild(closeBtn);
    
    const inputRow = document.querySelector('.input-row');
    const inputContainer = document.querySelector('.input-container');
    inputContainer.insertBefore(preview, inputRow);
    
    messageInput.focus();
    updateInputPlaceholder();
}

function editMessage(messageId) {
    const msg = messages.get(messageId);
    if (!msg || msg.author !== username) return;
    
    editingMessageId = messageId;
    replyingTo = null;
    
    messageInput.value = msg.content;
    messageInput.focus();
    
    // Show edit indicator
    const existingPreview = document.querySelector('.reply-preview');
    if (existingPreview) existingPreview.remove();
    
    const preview = document.createElement('div');
    preview.classList.add('reply-preview', 'edit-preview');
    preview.textContent = 'Editing message...';
    
    const closeBtn = document.createElement('button');
    closeBtn.classList.add('reply-close');
    closeBtn.innerHTML = '×';
    closeBtn.onclick = () => {
        editingMessageId = null;
        messageInput.value = '';
        preview.remove();
        updateInputPlaceholder();
    };
    preview.appendChild(closeBtn);
    
    const inputRow = document.querySelector('.input-row');
    const inputContainer = document.querySelector('.input-container');
    inputContainer.insertBefore(preview, inputRow);
    
    updateInputPlaceholder();
}

function markAsRead(messageId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    ws.send(JSON.stringify({
        type: 'read_receipt',
        id: messageId
    }));
}

function jumpToMessage(messageId) {
    const targetMessage = messagesDiv.querySelector(`[data-message-id="${messageId}"]`);
    if (!targetMessage) {
        // Message might not be loaded yet, try to find it
        console.warn('Message not found:', messageId);
        return;
    }
    
    // Scroll to the message smoothly
    targetMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Highlight the message
    targetMessage.classList.add('highlighted');
    
    // Remove highlight after animation
    setTimeout(() => {
        targetMessage.classList.remove('highlighted');
    }, 2000);
}

function formatTime(timestamp) {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    // Format time: HH:MM (24-hour) or h:mm AM/PM (12-hour)
    const timeOptions = { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false // Use 24-hour format
    };
    const timeStr = date.toLocaleTimeString([], timeOptions);
    
    // If message is from today, just show time
    if (messageDate.getTime() === today.getTime()) {
        return timeStr;
    }
    
    // If message is from yesterday
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (messageDate.getTime() === yesterday.getTime()) {
        return `Yesterday ${timeStr}`;
    }
    
    // If message is from this week (within last 7 days)
    const daysDiff = Math.floor((today - messageDate) / (1000 * 60 * 60 * 24));
    if (daysDiff < 7) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return `${dayNames[date.getDay()]} ${timeStr}`;
    }
    
    // For older messages, show date and time
    const dateOptions = { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    };
    return date.toLocaleDateString([], dateOptions);
}

function displayMessage(rawMessage) {
    // Fallback for old plain text format
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');

    if (rawMessage.startsWith('***')) {
        messageDiv.classList.add('system');
        messageDiv.textContent = rawMessage.replace(/\*\*\*/g, '').trim();
    } else if (rawMessage.startsWith('[')) {
        const match = rawMessage.match(/\[(.+?)\]: (.+)/);
        if (match) {
            const author = match[1];
            const content = match[2];
            
            if (author === username) {
                messageDiv.classList.add('own');
            } else {
                messageDiv.classList.add('other');
                const authorSpan = document.createElement('div');
                authorSpan.classList.add('message-author');
                authorSpan.textContent = author;
                messageDiv.appendChild(authorSpan);
            }
            
            const contentSpan = document.createElement('div');
            contentSpan.textContent = content;
            messageDiv.appendChild(contentSpan);
        } else {
            messageDiv.classList.add('other');
            messageDiv.textContent = rawMessage;
        }
    } else {
        messageDiv.classList.add('system');
        messageDiv.textContent = rawMessage;
    }

    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'system');
    messageDiv.textContent = text;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function leaveChat() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send('/quit');
        ws.close();
    }
    
    // Reset UI
    messagesDiv.innerHTML = '';
    usernameInput.value = '';
    messageInput.value = '';
    chatScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    username = '';
    ws = null;
    replyingTo = null;
    editingMessageId = null;
    messages.clear();
    document.querySelector('.reply-preview')?.remove();
}

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
});

// Emoji picker functionality - Expanded with many more emojis
const emojiCategories = {
    smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '🫠', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '☺️', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🫢', '🫣', '🤫', '🤔', '🫡', '🤐', '🤨', '😐', '😑', '😶', '🫥', '😏', '😒', '🙄', '😬', '🤥', '🫨', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '😶‍🌫️', '😵', '😵‍💫', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'],
    gestures: ['👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '🫳', '🫴', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '🫵', '👍', '👎', '👊', '✊', '🤛', '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄', '🫦', '👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔', '👨‍🦰', '👨‍🦱', '👨‍🦳', '👨‍🦲', '👩', '👩‍🦰', '🧑‍🦰', '👩‍🦱', '🧑‍🦱', '👩‍🦳', '🧑‍🦳', '👩‍🦲', '🧑‍🦲', '👱‍♀️', '👱‍♂️', '🧓', '👴', '👵', '🙍', '🙍‍♂️', '🙍‍♀️', '🙎', '🙎‍♂️', '🙎‍♀️', '🙅', '🙅‍♂️', '🙅‍♀️', '🙆', '🙆‍♂️', '🙆‍♀️', '💁', '💁‍♂️', '💁‍♀️', '🙋', '🙋‍♂️', '🙋‍♀️', '🧏', '🧏‍♂️', '🧏‍♀️', '🤦', '🤦‍♂️', '🤦‍♀️', '🤷', '🤷‍♂️', '🤷‍♀️', '🧑‍⚕️', '👨‍⚕️', '👩‍⚕️', '🧑‍🎓', '👨‍🎓', '👩‍🎓', '🧑‍🏫', '👨‍🏫', '👩‍🏫', '🧑‍⚖️', '👨‍⚖️', '👩‍⚖️', '🧑‍🌾', '👨‍🌾', '👩‍🌾', '🧑‍🍳', '👨‍🍳', '👩‍🍳', '🧑‍🔧', '👨‍🔧', '👩‍🔧', '🧑‍🏭', '👨‍🏭', '👩‍🏭', '🧑‍💼', '👨‍💼', '👩‍💼', '🧑‍🔬', '👨‍🔬', '👩‍🔬', '🧑‍💻', '👨‍💻', '👩‍💻', '🧑‍🎤', '👨‍🎤', '👩‍🎤', '🧑‍🎨', '👨‍🎨', '👩‍🎨', '🧑‍✈️', '👨‍✈️', '👩‍✈️', '🧑‍🚀', '👨‍🚀', '👩‍🚀', '🧑‍🚒', '👨‍🚒', '👩‍🚒', '👮', '👮‍♂️', '👮‍♀️', '🕵️', '🕵️‍♂️', '🕵️‍♀️', '💂', '💂‍♂️', '💂‍♀️', '🥷', '👷', '👷‍♂️', '👷‍♀️', '🤴', '👸', '👳', '👳‍♂️', '👳‍♀️', '👲', '🧕', '🤵', '🤵‍♂️', '🤵‍♀️', '👰', '👰‍♂️', '👰‍♀️', '🤰', '🤱', '👼', '🎅', '🤶', '🦸', '🦸‍♂️', '🦸‍♀️', '🦹', '🦹‍♂️', '🦹‍♀️', '🧙', '🧙‍♂️', '🧙‍♀️', '🧚', '🧚‍♂️', '🧚‍♀️', '🧛', '🧛‍♂️', '🧛‍♀️', '🧜', '🧜‍♂️', '🧜‍♀️', '🧝', '🧝‍♂️', '🧝‍♀️', '🧞', '🧞‍♂️', '🧞‍♀️', '🧟', '🧟‍♂️', '🧟‍♀️', '💆', '💆‍♂️', '💆‍♀️', '💇', '💇‍♂️', '💇‍♀️', '🚶', '🚶‍♂️', '🚶‍♀️', '🧍', '🧍‍♂️', '🧍‍♀️', '🧎', '🧎‍♂️', '🧎‍♀️', '🏃', '🏃‍♂️', '🏃‍♀️', '💃', '🕺', '🕴️', '👯', '👯‍♂️', '👯‍♀️', '🧘', '🧘‍♂️', '🧘‍♀️', '🛀', '🛌', '👭', '👫', '👬', '💏', '💑', '👪', '👨‍👩‍👧', '👨‍👩‍👧‍👦', '👨‍👩‍👦‍👦', '👨‍👩‍👧‍👧', '👩‍👩‍👦', '👩‍👩‍👧', '👩‍👩‍👧‍👦', '👩‍👩‍👦‍👦', '👩‍👩‍👧‍👧', '👨‍👨‍👦', '👨‍👨‍👧', '👨‍👨‍👧‍👦', '👨‍👨‍👦‍👦', '👨‍👨‍👧‍👧', '👩‍👦', '👩‍👧', '👩‍👧‍👦', '👩‍👦‍👦', '👩‍👧‍👧', '👨‍👦', '👨‍👧', '👨‍👧‍👦', '👨‍👦‍👦', '👨‍👧‍👧'],
    animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷️', '🕸️', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🦬', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🪶', '🦅', '🦆', '🦢', '🦩', '🦚', '🦜', '🐓', '🦃', '🦤', '🦣', '🦏', '🦛', '🦘', '🦡', '🐾'],
    food: ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🌽', '🥕', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🥞', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭', '🍔', '🍟', '🍕', '🥪', '🥙', '🌮', '🌯', '🥗', '🥘', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '☕️', '🍵', '🧃', '🥤', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🧊'],
    travel: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🦽', '🦼', '🛴', '🚲', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟', '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇', '🚊', '🚉', '✈️', '🛫', '🛬', '🛩️', '💺', '🛰️', '🚀', '🛸', '🚁', '🛶', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚢', '⚓', '⛽', '🚧', '🚦', '🚥', '🗺️', '🗿', '🗽', '🗼', '🏰', '🏯', '🏟️', '🎡', '🎢', '🎠', '⛲', '⛱️', '🏖️', '🏝️', '🏜️', '🌋', '⛰️', '🏔️', '🗻', '🏕️', '⛺', '🏠', '🏡', '🏘️', '🏚️', '🏗️', '🏭', '🏢', '🏬', '🏣', '🏤', '🏥', '🏦', '🏨', '🏪', '🏫', '🏩', '💒', '🏛️', '⛪', '🕌', '🕍', '🛕', '🕋', '⛩️', '🛤️', '🛣️', '🗾', '🎑', '🏞️', '🌅', '🌄', '🌠', '🎇', '🎆', '🌇', '🌆', '🏙️', '🌃', '🌌', '🌉', '🌁'],
    objects: ['⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🕹️', '🗜️', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯️', '🧯', '🛢️', '💸', '💵', '💴', '💶', '💷', '🪙', '💰', '💳', '💎', '⚖️', '🪜', '🧰', '🪛', '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🪚', '🔩', '⚙️', '🪤', '🧱', '⛓️', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡️', '⚔️', '🛡️', '🚬', '⚰️', '🪦', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '🕳️', '🩹', '🩺', '💊', '💉', '🩸', '🧬', '🦠', '🧫', '🧪', '🌡️', '🧹', '🪠', '🧺', '🧻', '🚽', '🚰', '🚿', '🛁', '🛀', '🧼', '🪥', '🪒', '🧽', '🪣', '🧴', '🛎️', '🔑', '🗝️', '🚪', '🪑', '🪑', '🛋️', '🛏️', '🛌', '🧸', '🪆', '🖼️', '🪞', '🪟', '🛍️', '🛒', '🎁', '🎈', '🎏', '🎀', '🪄', '🪅', '🎊', '🎉', '🎎', '🏮', '🎐', '🧧', '✉️', '📩', '📨', '📧', '💌', '📥', '📤', '📦', '🏷️', '🪧', '📪', '📫', '📬', '📭', '📮', '📯', '📜', '📃', '📄', '📑', '🧾', '📊', '📈', '📉', '🗒️', '🗓️', '📆', '📅', '🗑️', '📇', '🗃️', '🗳️', '🗄️', '📋', '📁', '📂', '🗂️', '🗞️', '📰', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📚', '📖', '🔖', '🧷', '🔗', '📎', '🖇️', '📐', '📏', '🧮', '📌', '📍', '✂️', '🖊️', '🖋️', '✒️', '🖌️', '🖍️', '📝', '✏️', '🔍', '🔎', '🔏', '🔐', '🔒', '🔓'],
    symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🔅', '🔆', '📶', '🛜', '♠️', '♥️', '♦️', '♣️', '🃏', '🀄', '🎴', '🎭', '🎨']
};

function initializeEmojis() {
    // Add event listeners to category buttons
    document.querySelectorAll('.emoji-category').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove active class from all categories
            document.querySelectorAll('.emoji-category').forEach(b => b.classList.remove('active'));
            // Add active class to clicked category
            e.target.classList.add('active');
            // Load emojis for this category
            loadEmojiCategory(e.target.dataset.category);
        });
    });

    // Load default category (smileys)
    loadEmojiCategory('smileys');
}

function loadEmojiCategory(category) {
    if (!emojiGrid) return;
    
    const emojis = emojiCategories[category] || emojiCategories.smileys;
    emojiGrid.innerHTML = '';

    emojis.forEach(emoji => {
        const emojiItem = document.createElement('button');
        emojiItem.className = 'emoji-item';
        emojiItem.textContent = emoji;
        emojiItem.addEventListener('click', (e) => {
            e.stopPropagation();
            insertEmoji(emoji);
        });
        emojiGrid.appendChild(emojiItem);
    });
}

function toggleEmojiPicker() {
    if (!emojiPicker || !emojiBtn) {
        console.error('Emoji picker elements not found');
        return;
    }
    
    if (emojiPicker.classList.contains('hidden')) {
        openEmojiPicker();
    } else {
        closeEmojiPicker();
    }
}

function openEmojiPicker() {
    if (!emojiPicker || !emojiBtn) return;
    emojiPicker.classList.remove('hidden');
    emojiBtn.classList.add('active');
    console.log('Emoji picker opened');
}

function closeEmojiPicker() {
    if (!emojiPicker || !emojiBtn) return;
    emojiPicker.classList.add('hidden');
    emojiBtn.classList.remove('active');
}

// Close emoji picker when clicking outside (only after DOM is ready)
document.addEventListener('click', (e) => {
    if (!emojiPicker || !emojiBtn) return;
    
    // Don't close if clicking on the emoji button or inside the picker
    if (emojiBtn.contains(e.target) || emojiPicker.contains(e.target)) {
        return;
    }
    
    // Close if clicking outside
    if (!emojiPicker.classList.contains('hidden')) {
        closeEmojiPicker();
    }
});

function insertEmoji(emoji) {
    const currentPos = messageInput.selectionStart;
    const textBefore = messageInput.value.substring(0, currentPos);
    const textAfter = messageInput.value.substring(messageInput.selectionEnd, messageInput.value.length);
    
    messageInput.value = textBefore + emoji + textAfter;
    messageInput.setSelectionRange(currentPos + emoji.length, currentPos + emoji.length);
    messageInput.focus();
    
    closeEmojiPicker();
}
