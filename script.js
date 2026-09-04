// Import Firebase SDKs (Modular Version via CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, addDoc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase Configuration Keys
const firebaseConfig = {
  apiKey: "AIzaSyAE09WCUJXlI_pBMruYI9iAZzn06x3rXKQ",
  authDomain: "communicateapp-a0107.firebaseapp.com",
  projectId: "communicateapp-a0107",
  storageBucket: "communicateapp-a0107.firebasestorage.app",
  messagingSenderId: "870120444707",
  appId: "1:870120444707:web:62bed66020f5400463f296"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

let currentLoggedInUser = null;
let unsubscribeMessages = null;

// --- ADVANCED INDEXEDDB STORAGE SYSTEM ---
const DB_NAME = "ChatAppLocalDB";
const DB_VERSION = 1;

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const dbInstance = event.target.result;
            if (!dbInstance.objectStoreNames.contains('chats')) {
                dbInstance.createObjectStore('chats', { keyPath: 'uid' });
            }
            if (!dbInstance.objectStoreNames.contains('messages')) {
                const msgStore = dbInstance.createObjectStore('messages', { keyPath: 'id' });
                msgStore.createIndex('conversationKey', 'conversationKey', { unique: false });
            }
        };
    });
}

async function saveChatsToIDB(chatsArray) {
    const dbInstance = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction('chats', 'readwrite');
        const store = transaction.objectStore('chats');
        store.clear();
        chatsArray.forEach(chat => store.put(chat));
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error);
    });
}

async function getChatsFromIDB() {
    const dbInstance = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction('chats', 'readonly');
        const store = transaction.objectStore('chats');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveMessageToIDB(msgId, msgData) {
    const dbInstance = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction('messages', 'readwrite');
        const store = transaction.objectStore('messages');
        store.put({ id: msgId, ...msgData });
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error);
    });
}

async function getMessagesFromIDB(conversationKey) {
    const dbInstance = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = dbInstance.transaction('messages', 'readonly');
        const store = transaction.objectStore('messages');
        const index = store.index('conversationKey');
        const request = index.getAll(conversationKey);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

window.onload = function() {
    const splash = document.getElementById('splash-screen');
    let authResolved = false;
    
    setTimeout(() => {
        if (!authResolved && splash) {
            splash.classList.remove('active');
            showScreen('login-screen');
        }
    }, 1500);

    onAuthStateChanged(auth, async (user) => {
        authResolved = true;
        if (user) {
            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                let username = user.email ? user.email.split('@')[0] : "user";
                
                if (userDoc.exists()) {
                    currentLoggedInUser = { uid: user.uid, ...userDoc.data() };
                } else {
                    currentLoggedInUser = { uid: user.uid, userId: username };
                    await setDoc(doc(db, "users", user.uid), {
                        userId: username,
                        email: user.email,
                        createdAt: new Date().toISOString()
                    });
                }
            } catch (e) {
                console.error("Error fetching/creating user doc:", e);
                currentLoggedInUser = { uid: user.uid, userId: user.email ? user.email.split('@')[0] : "user" };
            }

            if (splash) splash.classList.remove('active');
            showScreen('home-screen');
            
            loadChatsWithSmartSync();
            
            if (document.getElementById('chat-messages-area')) {
                initializeChatScreen();
            }
        } else {
            if (splash) splash.classList.remove('active');
            showScreen('login-screen');
        }
    });

    setupScrollEffect();
};

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.add('active');
    }
}

window.handleGoogleLogin = async function() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        let cleanUsername = user.email ? user.email.split('@')[0] : "user";

        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);

        if (!userDoc.exists()) {
            await setDoc(userRef, {
                userId: cleanUsername,
                email: user.email,
                createdAt: new Date().toISOString()
            });
        }

        currentLoggedInUser = { uid: user.uid, userId: cleanUsername };
        showScreen('home-screen');
        loadChatsWithSmartSync();
    } catch (error) {
        console.error("Google Sign-In Error:", error);
        alert("Google Login Failed: " + error.message);
    }
}

async function loadChatsWithSmartSync() {
    const listBox = document.getElementById('contact-list-box');
    if (!listBox || !currentLoggedInUser) return;

    let localChats = [];
    try {
        localChats = await getChatsFromIDB();
    } catch (e) {
        console.error("IDB read error:", e);
    }

    if (!localChats || localChats.length === 0) {
        listBox.innerHTML = `<p style="text-align:center; color:rgba(255,255,255,0.4); margin-top:20px;">Setting up your account data...</p>`;
        await syncDataFromServerAndSave();
    } else {
        renderChatCards(localChats);
        syncDataFromServerAndSave();
    }
}

async function syncDataFromServerAndSave() {
    try {
        const messagesSnapshot = await getDocs(collection(db, "messages"));
        const activeUserIds = new Set();

        messagesSnapshot.forEach((docSnap) => {
            const msg = docSnap.data();
            if (msg.senderId === currentLoggedInUser.uid && msg.receiverId !== currentLoggedInUser.uid) {
                activeUserIds.add(msg.receiverId);
            } else if (msg.receiverId === currentLoggedInUser.uid && msg.senderId !== currentLoggedInUser.uid) {
                activeUserIds.add(msg.senderId);
            }
        });

        const freshChatList = [];
        for (let targetUid of activeUserIds) {
            if (targetUid === currentLoggedInUser.uid) continue;

            const userDocRef = doc(db, "users", targetUid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                freshChatList.push({
                    uid: targetUid,
                    userId: userData.userId
                });
            }
        }

        await saveChatsToIDB(freshChatList);
        renderChatCards(freshChatList);

    } catch (err) {
        console.error("Server sync error: ", err);
    }
}

function renderChatCards(chatList) {
    const listBox = document.getElementById('contact-list-box');
    if (!listBox) return;

    const filteredList = chatList.filter(chat => currentLoggedInUser && chat.uid !== currentLoggedInUser.uid);

    if (!filteredList || filteredList.length === 0) {
        listBox.innerHTML = `<p style="text-align:center; color:rgba(255,255,255,0.4); margin-top:20px;">Koi chat nahi hai. 'New Chat' se naya user jodein!</p>`;
        return;
    }

    listBox.innerHTML = '';
    filteredList.forEach(chat => {
        const initials = chat.userId.substring(0, 2).toUpperCase();
        
        const card = document.createElement('div');
        card.className = 'contact-card';
        card.onclick = function() {
            window.location.href = `chat.html?chatWith=${chat.uid}&username=${chat.userId}`;
        };
        card.innerHTML = `
            <div class="contact-avatar">${initials}</div>
            <div class="contact-info">
                <div class="contact-header-row">
                    <span class="contact-name">${chat.userId}</span>
                    <span class="contact-time">Online</span>
                </div>
                <div class="contact-sub">Tap to open chat</div>
            </div>
        `;
        listBox.appendChild(card);
    });
}

window.goToNewChatPage = function() {
    window.location.href = 'newchat.html';
}

window.cancelNewChat = function() {
    window.location.href = 'index.html';
}

window.handleUserSearch = async function(queryText) {
    const previewBox = document.getElementById('user-preview-box');
    const nameLabel = document.getElementById('preview-user-name');
    const statusLabel = document.getElementById('preview-user-status');

    if (!previewBox) return;

    queryText = queryText.trim().toLowerCase();
    if (queryText.length > 0) {
        previewBox.style.display = 'flex';
        nameLabel.innerText = "Searching: " + queryText;
        statusLabel.innerText = "Checking database...";
        
        try {
            const querySnapshot = await getDocs(collection(db, "users"));
            let found = false;
            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                if (data.userId === queryText && docSnap.id !== currentLoggedInUser.uid) {
                    found = true;
                    nameLabel.innerText = data.userId;
                    statusLabel.innerText = "Online - Click to chat";
                    previewBox.onclick = () => {
                        window.location.href = `chat.html?chatWith=${docSnap.id}&username=${data.userId}`;
                    };
                }
            });
            if (!found) {
                nameLabel.innerText = queryText;
                statusLabel.innerText = "User not found";
            }
        } catch (e) {
            console.error(e);
        }
    } else {
        previewBox.style.display = 'none';
    }
}

window.startNewChat = function() {
    const userId = document.getElementById('new-chat-userid').value.trim().toLowerCase();
    if (!userId) {
        alert("Please enter a valid User ID!");
        return;
    }
    
    if (currentLoggedInUser && userId === currentLoggedInUser.userId) {
        alert("Aap khud ke sath chat nahi kar sakte!");
        return;
    }

    getDocs(collection(db, "users")).then((snapshot) => {
        let targetUid = "";
        snapshot.forEach((docSnap) => {
            if (docSnap.data().userId === userId) {
                targetUid = docSnap.id;
            }
        });
        if (targetUid) {
            window.location.href = `chat.html?chatWith=${targetUid}&username=${userId}`;
        } else {
            alert("User database mein nahi mila!");
        }
    });
}

// --- 100% LOCAL-FIRST CHAT RENDERING (INSTANT LOAD) ---
async function initializeChatScreen() {
    const urlParams = new URLSearchParams(window.location.search);
    const receiverUid = urlParams.get('chatWith');
    
    if (!receiverUid || !currentLoggedInUser) return;

    const messagesArea = document.getElementById('chat-messages-area');
    const conversationKey = [currentLoggedInUser.uid, receiverUid].sort().join('_');
    let displayedMessageIds = new Set();

    // 1. TURANT Local IndexedDB se load karo (Bina "Loading" dikhaye instant)
    try {
        const localMessages = await getMessagesFromIDB(conversationKey);
        if (localMessages && localMessages.length > 0) {
            localMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            messagesArea.innerHTML = "";
            localMessages.forEach(msg => {
                displayedMessageIds.add(msg.id);
                appendMessageBubble(msg, messagesArea);
            });
            messagesArea.scrollTop = messagesArea.scrollHeight;
        } else {
            messagesArea.innerHTML = `<p style="text-align:center; color:rgba(255,255,255,0.4); margin-top:20px;">Abhi koi message nahi hai. Pehla message bhejein!</p>`;
        }
    } catch (e) {
        console.error("IDB messages load error:", e);
    }

    // 2. Background mein Firebase se sync karo taaki naye messages apne aap aate rahein
    const q = query(collection(db, "messages"), orderBy("timestamp", "asc"));
    
    if (unsubscribeMessages) unsubscribeMessages();

    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        snapshot.forEach((docSnap) => {
            const msgId = docSnap.id;
            const msg = docSnap.data();
            const isRelevant = 
                (msg.senderId === currentLoggedInUser.uid && msg.receiverId === receiverUid) ||
                (msg.senderId === receiverUid && msg.receiverId === currentLoggedInUser.uid);

            if (isRelevant) {
                const fullMsgObj = { id: msgId, conversationKey, ...msg };
                
                // Background mein IDB me save karo
                saveMessageToIDB(msgId, fullMsgObj);

                // Agar yeh message screen par nahi hai, tabhi dikhao
                if (!displayedMessageIds.has(msgId)) {
                    displayedMessageIds.add(msgId);
                    
                    const placeholder = messagesArea.querySelector('p');
                    if (placeholder) {
                        messagesArea.innerHTML = "";
                    }

                    appendMessageBubble(fullMsgObj, messagesArea);
                    messagesArea.scrollTop = messagesArea.scrollHeight;
                }
            }
        });
    });
}

function appendMessageBubble(msg, messagesArea) {
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${msg.senderId === currentLoggedInUser.uid ? 'sent' : 'received'}`;
    bubble.innerText = msg.text;
    messagesArea.appendChild(bubble);
}

window.goBackToHome = function() {
    window.location.href = 'index.html';
}

window.sendMessage = async function() {
    const inputField = document.getElementById('message-input-field');
    if (!inputField) return;
    
    const msgText = inputField.value.trim();
    if (msgText === "" || !currentLoggedInUser) return;

    const urlParams = new URLSearchParams(window.location.search);
    const receiverUid = urlParams.get('chatWith');
    
    if (!receiverUid) {
        alert("Receiver select nahi hai!");
        return;
    }

    try {
        const conversationKey = [currentLoggedInUser.uid, receiverUid].sort().join('_');
        const newMsgData = {
            senderId: currentLoggedInUser.uid,
            receiverId: receiverUid,
            text: msgText,
            timestamp: new Date().toISOString(),
            conversationKey: conversationKey
        };

        const docRef = await addDoc(collection(db, "messages"), newMsgData);
        await saveMessageToIDB(docRef.id, { id: docRef.id, ...newMsgData });

        inputField.value = "";
    } catch (e) {
        console.error("Error sending message: ", e);
    }
}

window.toggleFabMenu = function() {
    const menu = document.getElementById('fabMenu');
    const arrow = document.getElementById('arrowToggleBtn');
    if (menu && arrow) {
        menu.classList.toggle('collapsed');
        arrow.classList.toggle('rotated');
    }
}

function setupScrollEffect() {
    let lastScrollTop = 0;
    const contactListBox = document.getElementById('contact-list-box');
    
    if (contactListBox) {
        contactListBox.addEventListener('scroll', function() {
            let st = contactListBox.scrollTop;
            const menu = document.getElementById('fabMenu');
            const arrow = document.getElementById('arrowToggleBtn');
            
            if (menu && arrow) {
                if (st > lastScrollTop && st > 20) {
                    menu.classList.add('collapsed');
                    arrow.classList.add('rotated');
                }
            }
            lastScrollTop = st <= 0 ? 0 : st;
        });
    }
}

window.switchMainTab = function(tabName) {
    if (tabName === 'chats') {
        alert("Aap already Chats tab par hain.");
    } else if (tabName === 'contacts') {
        alert("Contacts section open ho raha hai...");
    } else if (tabName === 'settings') {
        alert("Settings panel jaldi aayega!");
    }
    
    const menu = document.getElementById('fabMenu');
    const arrow = document.getElementById('arrowToggleBtn');
    if (menu && arrow) {
        menu.classList.add('collapsed');
        arrow.classList.add('rotated');
    }
            }
  
