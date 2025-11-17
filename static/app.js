let ws = null;
let username = '';
let joinCode = '';
let replyingTo = null; 
let editingMessageId = null;
let messages = new Map();

// DOM element lookups
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const usernameInput = document.getElementById('username-input');
const joinCodeInput = document.getElementById('join-code-input');
const joinBtn = document.getElementById('join-btn');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const messagesDiv = document.getElementById('messages');
const currentUserSpan = document.getElementById('current-user');
const memberAvatarsContainer = document.getElementById('member-avatars');
const leaveBtn = document.getElementById('leave-btn');
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');
const emojiGrid = document.getElementById('emoji-grid');
const imageBtn = document.getElementById('image-btn');
const imageInput = document.getElementById('image-input');
const imagePreview = document.getElementById('image-preview');
let selectedImage = null;


let db = null;
let auth = null;
let collection = null;
let addDoc = null;
let serverTimestamp = null;
let query = null;
let orderBy = null;
let limit = null;
let onSnapshot = null;
let getDocs = null;

let messagesCollection = null;
let loginsCollection = null;

function assignFirebaseServices(services = {}) {
  db = services.db || null;
  auth = services.auth || null;
  collection = services.collection || null;
  addDoc = services.addDoc || null;
  serverTimestamp = services.serverTimestamp || null;
  query = services.query || null;
  orderBy = services.orderBy || null;
  limit = services.limit || null;
  onSnapshot = services.onSnapshot || null;
  getDocs = services.getDocs || null;
}

async function ensureFirebaseServices() {
  if (db && collection && addDoc && serverTimestamp) {
    return true;
  }

  if (window.firebaseServices) {
    assignFirebaseServices(window.firebaseServices);
    return true;
  }

  if (window.firebaseServicesReady?.then) {
    try {
      const services = await window.firebaseServicesReady;
      assignFirebaseServices(services);
      return true;
    } catch (error) {
      console.error('[Firestore] Failed to resolve firebaseServicesReady:', error);
      return false;
    }
  }

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.error('[Firestore] Firebase services did not become available in time');
      resolve(false);
    }, 5000);

    window.addEventListener(
      'firebase-services-ready',
      (event) => {
        clearTimeout(timeoutId);
        assignFirebaseServices(event.detail || window.firebaseServices);
        resolve(true);
      },
      { once: true }
    );
  });
}

async function initFirebaseCollections(roomCode = 'default') {
  const ready = await ensureFirebaseServices();
  if (!ready || !db || !collection) {
    console.error('[Firestore] Database not available');
    return false;
  }

  messagesCollection = collection(db, 'rooms', roomCode, 'messages');
  loginsCollection = collection(db, 'logins');
  console.log(`[Firestore] Collections initialized for room ${roomCode}`);
  return true;
}

// EMOJI CATEGORIES
const emojiCategories = {
    smileys: ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "🫠", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "☺️", "😚", "😙", "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🫢", "🫣", "🤫", "🤔", "🫡", "🤐", "🤨", "😐", "😑", "😶", "🫥", "😏", "😒", "🙄", "😬", "🤥", "🫨", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🤧", "🥵", "🥶", "😶‍🌫️", "😵", "😵‍💫", "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐", "😕", "😟", "🙁", "☹️", "😮", "😯", "😲", "😳", "🥺", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫", "🥱", "😤", "😡", "😠", "🤬", "😈", "👿", "💀", "☠️", "💩", "🤡", "👹", "👺", "👻", "👽", "👾", "🤖", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾"],
    gestures: ["👋", "🤚", "🖐️", "✋", "🖖", "🫱", "🫲", "🫳", "🫴", "👌", "🤌", "🤏", "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "🫵", "👍", "👎", "👊", "✊", "🤛", "🤜", "👏", "🙌", "🫶", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🦿", "🦵", "🦶", "👂", "🦻", "👃", "🧠", "🫀", "🫁", "🦷", "🦴", "👀", "👁️", "👅", "👄", "🫦"],
    animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷️', '🕸️', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🦬', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🪶', '🦢', '🦩', '🦚', '🦜', '🐓', '🦃', '🦤', '🦣', '🦘', '🦡', '🐾'],
    food: ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🌽', '🥕', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🥞', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭', '🍔', '🍟', '🍕', '🥪', '🥙', '🌮', '🌯', '🥗', '🥘', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '☕️', '🍵', '🧃', '🥤', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🧊'],
    travel: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🦽', '🦼', '🛴', '🚲', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟', '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇', '🚊', '🚉', '✈️', '🛫', '🛬', '🛩️', '💺', '🛰️', '🚀', '🛸', '🚁', '🛶', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚢', '⚓', '⛽', '🚧', '🚦', '🚥', '🗺️', '🗿', '🗽', '🗼', '🏰', '🏯', '🏟️', '🎡', '🎢', '🎠', '⛲', '⛱️', '🏖️', '🏝️', '🏜️', '🌋', '⛰️', '🏔️', '🗻', '🏕️', '⛺'],
    objects: ['⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🕹️', '🗜️', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯️', '🧯', '🛢️', '💸', '💵', '💴', '💶', '💷', '🪙', '💰', '💳', '💎', '⚖️', '🪜', '🧰', '🪛', '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🪚', '🔩', '⚙️', '🪤', '🧱', '⛓️', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡️', '⚔️', '🛡️', '🚬', '⚰️', '🪦', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬'],
    symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🔅', '🔆', '📶', '🛜', '♠️', '♥️', '♦️', '♣️', '🃏', '🀄', '🎴', '🎭', '🎨']
};

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

// Image upload 
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

function initEmojiPicker() {
    const btn = document.getElementById('emoji-btn');
    const picker = document.getElementById('emoji-picker');
    const grid = document.getElementById('emoji-grid');
    
    if (!btn || !picker || !grid) {
        console.log('Emoji elements not ready yet');
        return false;
    }
    
    if (!btn.hasAttribute('data-emoji-initialized')) {
        btn.setAttribute('data-emoji-initialized', 'true');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            toggleEmojiPicker();
        });
    }
    
    if (!grid.hasAttribute('data-emoji-initialized')) {
        grid.setAttribute('data-emoji-initialized', 'true');
        initializeEmojis();
    }
    
    return true;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEmojiPicker);
} else {
    initEmojiPicker();
}

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

async function loadFirebaseHistory() {
    if (!messagesCollection) {
        console.error('[Firestore] Cannot load history - messagesCollection not initialized');
        return;
    }

    if (!query || !orderBy || !limit || !getDocs) {
        console.error('[Firestore] Firestore helpers missing; cannot load history');
        return;
    }
    
    try {
        const historyQuery = query(
            messagesCollection, 
            orderBy('timestamp', 'asc'), 
            limit(200)
        );

        const snapshot = await getDocs(historyQuery);
        console.log('[Firestore] History snapshot received with', snapshot.docs.length, 'documents');

        snapshot.forEach((doc) => {
            const data = doc.data();
            handleMessage({
                type: 'message',
                id: doc.id,
                author: data.author,
                content: data.content,
                image: data.image || null,
                replyTo: data.replyTo || null,
                replyToAuthor: data.replyToAuthor || null,
                replyToContent: data.replyToContent || null,
                timestamp: (data.timestamp && data.timestamp.seconds) 
                    ? data.timestamp.seconds 
                    : Date.now() / 1000,
            });
        });
    } catch (error) {
        console.error('[Firestore] Failed to load history:', error);
    }
}

async function firebaseSendMessage(msgObj) {
    if (!messagesCollection) {
        console.error('[Firestore] messagesCollection is not initialized');
        return;
    }
    
    try {
        const docRef = await addDoc(messagesCollection, {
            author: msgObj.author,
            content: msgObj.content,
            image: msgObj.image || null,
            replyTo: msgObj.replyTo || null,
            replyToAuthor: msgObj.replyToAuthor || null,
            replyToContent: msgObj.replyToContent || null,
            timestamp: serverTimestamp(),
        });
        console.log('[Firestore] Document written with ID:', docRef.id);
    } catch (error) {
        console.error('[Firestore] Error adding document:', error);
        throw error;
    }
}

async function logFirebaseLogin(username, roomCode) {
    if (!loginsCollection) {
        console.error('[Firestore] loginsCollection is not initialized');
        return;
    }
    
    try {
        const docRef = await addDoc(loginsCollection, {
            username,
            roomCode,
            joinedAt: serverTimestamp(),
        });
        console.log('[Firestore] Login logged with ID:', docRef.id);
    } catch (error) {
        console.error('[Firestore] Error logging login:', error);
        console.error('[Firestore] Error details:', error.code, error.message);
    }
}

async function joinChat() {
    const name = usernameInput.value.trim();
    const code = joinCodeInput ? joinCodeInput.value.trim() : '';
    if (name === '') {
        alert('Please enter your name');
        return;
    }
    if (!code) {
        alert('Please enter the join code');
        return;
    }

    username = name;
    joinCode = code;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('Connected to chat server');
        ws.send(JSON.stringify({
            type: 'join',
            name: username,
            code: joinCode,
        }));
    };

    ws.onmessage = async (event) => {
        const data = event.data.trim();

        if (data === 'Invalid join code') {
            alert('Invalid join code');
            if (!loginScreen.classList.contains('hidden')) {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.close();
                }
            } else {
                leaveChat();
            }
            return;
        }

        if (data === 'Invalid join message') {
            alert('Invalid join message from server. Please try again.');
            if (!loginScreen.classList.contains('hidden')) {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.close();
                }
            } else {
                leaveChat();
            }
            return;
        }

        if (loginScreen && !loginScreen.classList.contains('hidden')) {
            loginScreen.classList.add('hidden');
            chatScreen.classList.remove('hidden');
            if (currentUserSpan) {
                currentUserSpan.textContent = 'Yapchat';
            }

            setTimeout(() => {
                initEmojiPicker();
            }, 100);
            messageInput.focus();
            
            // Setup Firebase after successful join
            console.log('[Firestore] Setting up Firebase after successful join...');
            try {
                const collectionsReady = await initFirebaseCollections(joinCode);
                if (collectionsReady) {
                    await logFirebaseLogin(username, joinCode);
                    await loadFirebaseHistory();
                }
            } catch (error) {
                console.error('[Firestore] Failed to initialize Firebase:', error);
            }
        }
        
        try {
            const message = JSON.parse(data);
            if (message && message.type) {
                handleMessage(message);
                return;
            }
        } catch (e) {
            // Not JSON
        }
        
        const oldFormatMatch = data.match(/^\[(.+?)\]:\s*(.+)$/);
        if (oldFormatMatch) {
            const author = oldFormatMatch[1];
            const content = oldFormatMatch[2];
            
            try {
                const jsonContent = JSON.parse(content);
                if (jsonContent && jsonContent.type) {
                    jsonContent.author = author;
                    if (!jsonContent.id) jsonContent.id = 'msg_' + Date.now() + '_' + author;
                    if (!jsonContent.timestamp) jsonContent.timestamp = Math.floor(Date.now() / 1000);
                    handleMessage(jsonContent);
                    return;
                }
            } catch (e) {
                // Plain text
            }
            
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

async function sendMessage() {
    const message = messageInput.value.trim();
    const hasImage = selectedImage !== null;
    
    if ((message === '' && !hasImage) || !ws || ws.readyState !== WebSocket.OPEN) {
        return;
    }
    
    let messageObj;
    
    if (editingMessageId) {
        ws.send(JSON.stringify({
            type: 'edit',
            id: editingMessageId,
            content: message
        }));
        editingMessageId = null;
        document.querySelector('.reply-preview')?.remove();
    } else {
        messageObj = {
            type: 'message',
            author: username,
            content: message || ''
        };
        
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
        
        // Store in Firestore
        try {
            await firebaseSendMessage(messageObj);
            console.log('[Firestore] Message saved successfully:', messageObj);
        } catch (err) {
            console.error('[Firestore] Failed to save message:', err);
            console.error('[Firestore] Error details:', err.message, err.code);
        }
    }
    
    messageInput.value = '';
    messageInput.focus();
    updateInputPlaceholder();
}

function handleImageSelect(file) {
    if (file.size > 10 * 1024 * 1024) {
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
            setTimeout(() => markAsRead(msg.id), 500);
            break;
        case 'edit':
            updateMessage(msg);
            break;
        case 'read_receipt':
            updateReadReceipts(msg);
            break;
        case 'stats':
            updateStatsDisplay(msg.totalMembers, msg.onlineMembers, msg.memberNames);
            break;
        case 'history':
            if (Array.isArray(msg.messages)) {
                msg.messages.forEach((historyMsg) => handleMessage(historyMsg));
            }
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

function updateStatsDisplay(totalMembers, onlineMembers, memberNames) {
    const onlineEl = document.getElementById('online-count');
    if (!onlineEl) return;
    renderMemberAvatars(Array.isArray(memberNames) ? memberNames : []);

    if (typeof totalMembers === 'number' && typeof onlineMembers === 'number') {
        const memberLabel = totalMembers === 1 ? 'member' : 'members';
        const onlineLabel = onlineMembers === 1 ? 'online' : 'online';
        onlineEl.textContent = `${totalMembers} ${memberLabel}, ${onlineMembers} ${onlineLabel}`;
    } else {
        onlineEl.textContent = 'Online';
    }
}

function renderMemberAvatars(memberNames) {
    if (!memberAvatarsContainer) return;
    memberAvatarsContainer.innerHTML = '';

    if (!memberNames || memberNames.length === 0) {
        memberAvatarsContainer.classList.add('hidden');
        return;
    }

    const uniqueNames = Array.from(new Set(memberNames.filter(Boolean)));
    if (uniqueNames.length === 0) {
        memberAvatarsContainer.classList.add('hidden');
        return;
    }

    memberAvatarsContainer.classList.remove('hidden');
    const maxVisible = 4;

    uniqueNames.slice(0, maxVisible).forEach((name) => {
        const avatar = document.createElement('div');
        avatar.classList.add('member-avatar');
        const initial = name.trim().charAt(0).toUpperCase() || '?';
        avatar.textContent = initial;
        avatar.title = name;
        memberAvatarsContainer.appendChild(avatar);
    });

    if (uniqueNames.length > maxVisible) {
        const remaining = uniqueNames.length - maxVisible;
        const moreAvatar = document.createElement('div');
        moreAvatar.classList.add('member-avatar', 'more');
        moreAvatar.textContent = `+${remaining}`;
        moreAvatar.title = `${remaining} more online`;
        memberAvatarsContainer.appendChild(moreAvatar);
    }
}

function displayUserMessage(msg) {
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
    
    messages.set(msg.id, msg);
    
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    messageDiv.dataset.messageId = msg.id;
    
    if (msg.author === username) {
        messageDiv.classList.add('own');
    } else {
        messageDiv.classList.add('other');
        const authorSpan = document.createElement('div');
        authorSpan.classList.add('message-author');
        authorSpan.textContent = msg.author;
        messageDiv.appendChild(authorSpan);
    }
    
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
        
        const arrowIcon = document.createElement('span');
        arrowIcon.classList.add('reply-arrow');
        arrowIcon.innerHTML = '↗';
        replyPreview.appendChild(arrowIcon);
        
        messageDiv.appendChild(replyPreview);
    }
    
    if (msg.image) {
        const imageDiv = document.createElement('div');
        imageDiv.classList.add('message-image');
        const img = document.createElement('img');
        img.src = msg.image;
        img.alt = 'Shared image';
        img.loading = 'lazy';
        img.onclick = () => {
            const newWindow = window.open();
            newWindow.document.write(`<img src="${msg.image}" style="max-width: 100%; height: auto;">`);
        };
        imageDiv.appendChild(img);
        messageDiv.appendChild(imageDiv);
    }
    
    if (msg.content && msg.content.trim() !== '') {
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('message-content');
        contentDiv.textContent = msg.content;
        messageDiv.appendChild(contentDiv);
    }
    
    const metaDiv = document.createElement('div');
    metaDiv.classList.add('message-meta');
    
    const timeSpan = document.createElement('span');
    timeSpan.classList.add('message-time');
    timeSpan.textContent = msg.timestamp ? formatTime(msg.timestamp) : 'just now';
    metaDiv.appendChild(timeSpan);
    
    if (msg.edited) {
        const editedSpan = document.createElement('span');
        editedSpan.classList.add('edited-indicator');
        editedSpan.textContent = 'edited';
        metaDiv.appendChild(editedSpan);
    }
    
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
    
    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('message-actions');
    
    if (msg.author !== username) {
        const replyBtn = document.createElement('button');
        replyBtn.classList.add('action-btn', 'reply-btn');
        replyBtn.innerHTML = '↩';
        replyBtn.title = 'Reply';
        replyBtn.onclick = () => replyToMessage(msg.id);
        actionsDiv.appendChild(replyBtn);
    }
    
    if (msg.author === username) {
        const editBtn = document.createElement('button');
        editBtn.classList.add('action-btn', 'edit-btn');
        editBtn.innerHTML = '✎';
        editBtn.title = 'Edit';
        editBtn.onclick = () => editMessage(msg.id);
        actionsDiv.appendChild(editBtn);
    }
    
    messageDiv.appendChild(actionsDiv);
    
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
        console.warn('Message not found:', messageId);
        return;
    }
    
    targetMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetMessage.classList.add('highlighted');
    
    setTimeout(() => {
        targetMessage.classList.remove('highlighted');
    }, 2000);
}

function formatTime(timestamp) {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const timeOptions = { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false
    };
    const timeStr = date.toLocaleTimeString([], timeOptions);
    
    if (messageDate.getTime() === today.getTime()) {
        return timeStr;
    }
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (messageDate.getTime() === yesterday.getTime()) {
        return `Yesterday ${timeStr}`;
    }
    
    const daysDiff = Math.floor((today - messageDate) / (1000 * 60 * 60 * 24));
    if (daysDiff < 7) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return `${dayNames[date.getDay()]} ${timeStr}`;
    }
    
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

window.addEventListener('beforeunload', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
});

function initializeEmojis() {
    document.querySelectorAll('.emoji-category').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.emoji-category').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            loadEmojiCategory(e.target.dataset.category);
        });
    });
    
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
}

function closeEmojiPicker() {
    if (!emojiPicker || !emojiBtn) return;
    emojiPicker.classList.add('hidden');
    emojiBtn.classList.remove('active');
}

document.addEventListener('click', (e) => {
    if (!emojiPicker || !emojiBtn) return;
    
    if (emojiBtn.contains(e.target) || emojiPicker.contains(e.target)) {
        return;
    }
    
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