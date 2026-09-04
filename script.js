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

window.onload = function() {
    const splash = document.getElementById('splash-screen');
    let authResolved = false;
    
    setTimeout(() => {
        if (!authResolved && splash) {
            splash.classList.remove('active');
            showScreen('login-screen');
        }
    }, 1500);

    // Automatic session persistence check
    onAuthStateChanged(auth, async (user) => {
        authResolved = true;
        if (user) {
            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                let username = user.email ? user.email.split('@')[0] : "user";
                
                if (userDoc.exists()) {
                    currentLoggedInUser = { uid: user.uid, ...userDoc.data() };
                } else {
                    // Create user profile in Firestore if it's their first time logging in
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
            loadFirebaseChats();
            
            if (document.getElementById('chat-messages-area')) {
                initializeChatScreen();
            }
        } else {
            if (splash) splash.classList.remove('active');
            showScreen('login-screen');
        }
    });

    // Setup scroll listener safely after DOM is fully loaded
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

// Seamless One-Click Google Sign-In Handler
window.handleGoogleLogin = async function() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        let cleanUsername = user.email ? user.email.split('@')[0] : "user";

        // Check if user document already exists in Firestore
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
        loadFirebaseChats();
    } catch (error) {
        console.error("Google Sign-In Error:", error);
        alert("Google Login Failed: " + error.message);
    }
}

// Load real users from Firebase Firestore database into contact list
async function loadFirebaseChats() {
    const listBox = document.getElementById('contact-list-box');
    if (!listBox) return;
    listBox.innerHTML = `<p style="text-align:center; color:rgba(255,255,255,0.4); margin-top:20px;">Loading contacts...</p>`;

    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        listBox.innerHTML = '';

        querySnapshot.forEach((docSnap) => {
            const userData = docSnap.data();
            if (currentLoggedInUser && userData.uid !== currentLoggedInUser.uid && userData.userId !== currentLoggedInUser.userId) {
                const initials = userData.userId.substring(0, 2).toUpperCase();
                
                const card = document.createElement('div');
                card.className = 'contact-card';
                card.onclick = function() {
                    window.location.href = `chat.html?chatWith=${docSnap.id}&username=${userData.userId}`;
                };
                card.innerHTML = `
                    <div class="contact-avatar">${initials}</div>
                    <div class="contact-info">
                        <div class="contact-header-row">
                            <span class="contact-name">${userData.userId}</span>
                            <span class="contact-time">Online</span>
                        </div>
                        <div class="contact-sub">Tap to start chatting</div>
                    </div>
                `;
                listBox.appendChild(card);
            }
        });

        if (listBox.innerHTML === '') {
            listBox.innerHTML = `<p style="text-align:center; color:rgba(255,255,255,0.4); margin-top:20px;">No other users found yet. Use 'New Chat' to find someone!</p>`;
        }
    } catch (err) {
        console.error("Error loading chats: ", err);
    }
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
                if (data.userId === queryText) {
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

// Chat Screen & Realtime Message Sync Functions
function initializeChatScreen() {
    const urlParams = new URLSearchParams(window.location.search);
    const receiverUid = urlParams.get('chatWith');
    
    if (!receiverUid || !currentLoggedInUser) return;

    const messagesArea = document.getElementById('chat-messages-area');
    messagesArea.innerHTML = `<p style="text-align:center; color:rgba(255,255,255,0.4); margin-top:20px;">Messages sync ho rahe hain...</p>`;

    const q = query(collection(db, "messages"), orderBy("timestamp", "asc"));
    
    if (unsubscribeMessages) unsubscribeMessages();

    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        messagesArea.innerHTML = "";
        let count = 0;

        snapshot.forEach((docSnap) => {
            const msg = docSnap.data();
            const isRelevant = 
                (msg.senderId === currentLoggedInUser.uid && msg.receiverId === receiverUid) ||
                (msg.senderId === receiverUid && msg.receiverId === currentLoggedInUser.uid);

            if (isRelevant) {
                count++;
                const bubble = document.createElement('div');
                bubble.className = `message-bubble ${msg.senderId === currentLoggedInUser.uid ? 'sent' : 'received'}`;
                bubble.innerText = msg.text;
                messagesArea.appendChild(bubble);
            }
        });

        if (count === 0) {
            messagesArea.innerHTML = `<p style="text-align:center; color:rgba(255,255,255,0.4); margin-top:20px;">Abhi koi message nahi hai. Pehla message bhejein!</p>`;
        }

        messagesArea.scrollTop = messagesArea.scrollHeight;
    });
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
        await addDoc(collection(db, "messages"), {
            senderId: currentLoggedInUser.uid,
            receiverId: receiverUid,
            text: msgText,
            timestamp: new Date().toISOString()
        });
        inputField.value = "";
    } catch (e) {
        console.error("Error sending message: ", e);
    }
}

// --- FLOATING MENU & SCROLL CONTROLS ---

// Toggle Floating Menu via Arrow Button
window.toggleFabMenu = function() {
    const menu = document.getElementById('fabMenu');
    const arrow = document.getElementById('arrowToggleBtn');
    if (menu && arrow) {
        menu.classList.toggle('collapsed');
        arrow.classList.toggle('rotated');
    }
}

// Auto-hide menu when user scrolls down the contact list
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
                    // Scrolling down -> Hide menu automatically
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
    
    // Click karne par menu band kar dein
    const menu = document.getElementById('fabMenu');
    const arrow = document.getElementById('arrowToggleBtn');
    if (menu && arrow) {
        menu.classList.add('collapsed');
        arrow.classList.add('rotated');
    }
}
