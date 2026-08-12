// =====================
// VERIFYSTAY - Chat / Messages
// One page handles both the inbox list (chat.html) and an open thread
// (chat.html?with=<uid>&propertyId=<id>&propertyTitle=<title>).
// Chat IDs are deterministic (sorted pair of UIDs) so there's only ever
// ONE thread between any two people, no matter how many properties they
// discuss — same as how Fiverr keeps one inbox thread per buyer/seller
// pair, not one per gig.
// =====================

let currentUser = null;
let activeChatId = null;
let unsubscribeMessages = null;

auth.onAuthStateChanged((user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = user;

    const params = new URLSearchParams(window.location.search);
    const withUid = params.get('with');

    if (withUid) {
        openThread(withUid, params.get('propertyId'), params.get('propertyTitle'));
    } else {
        renderInbox();
    }
});

function chatIdFor(uidA, uidB) {
    return [uidA, uidB].sort().join('_');
}

// Message notifications link to "chat.html?with=<senderId>" — opening
// that exact conversation is the clearest possible signal you've seen
// them, so clear them here rather than only when visiting the separate
// Notifications page (which most people skip entirely, going straight
// to Messages instead — that's why the badge kept climbing).
async function clearMessageNotificationsFrom(otherUid) {
    try {
        const snapshot = await db.collection('notifications')
            .where('userId', '==', currentUser.uid)
            .where('type', '==', 'message')
            .where('read', '==', false)
            .get();

        const toClear = snapshot.docs.filter(doc => (doc.data().link || '').includes(`with=${otherUid}`));
        await Promise.all(toClear.map(doc => doc.ref.update({ read: true })));
    } catch (e) {
        console.warn('Could not clear message notifications:', e);
    }
}

// Shows just the time for messages sent today, "Yesterday HH:MM" for
// yesterday, and a short date for anything older — same pattern most
// chat apps use so timestamps stay readable without cluttering the bubble.
function formatMessageTime(date) {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return timeStr;
    if (isYesterday) return `Yesterday ${timeStr}`;
    return `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${timeStr}`;
}

// ---------------------------------------------------------------
// INBOX — list of conversations, most recent first
// ---------------------------------------------------------------
async function renderInbox() {
    const container = document.getElementById('chatContainer');
    try {
        const snapshot = await db.collection('chats')
            .where('participants', 'array-contains', currentUser.uid)
            .get();

        if (snapshot.empty) {
            container.innerHTML = `
                <h2>💬 Messages</h2>
                <p style="color:#999;text-align:center;padding:30px 0;">No conversations yet. Message threads start when you apply to a property or someone contacts you.</p>
            `;
            return;
        }

        const chats = [];
        snapshot.forEach(doc => chats.push({ id: doc.id, ...doc.data() }));
        chats.sort((a, b) => {
            const ta = a.lastMessageAt ? a.lastMessageAt.toMillis() : 0;
            const tb = b.lastMessageAt ? b.lastMessageAt.toMillis() : 0;
            return tb - ta;
        });

        const items = chats.map(chat => {
            const otherUid = chat.participants.find(id => id !== currentUser.uid);
            const otherName = (chat.participantNames && chat.participantNames[otherUid]) || 'VerifyStay User';
            const otherPhoto = (chat.participantPhotos && chat.participantPhotos[otherUid]) || null;
            const unread = (chat.unreadBy && chat.unreadBy[currentUser.uid]) || 0;
            const preview = chat.lastMessage || 'Say hello 👋';

            return `
                <a href="chat.html?with=${otherUid}" class="thread-item">
                    <div class="avatar">${otherPhoto ? `<img src="${otherPhoto}" alt="">` : '👤'}</div>
                    <div class="meta">
                        <div class="name">${escapeHtml(otherName)}</div>
                        <div class="preview">${escapeHtml(preview)}</div>
                        ${chat.propertyTitle ? `<div style="font-size:12px;color:#999;">Re: ${escapeHtml(chat.propertyTitle)}</div>` : ''}
                    </div>
                    ${unread > 0 ? `<span class="unread-dot"></span>` : ''}
                </a>
            `;
        }).join('');

        container.innerHTML = `<h2>💬 Messages</h2>${items}`;
    } catch (error) {
        console.error('Error loading inbox:', error);
        container.innerHTML = '<p style="color:#c62828;">Could not load messages.</p>';
    }
}

// ---------------------------------------------------------------
// THREAD — open (or create) a conversation with a specific person
// ---------------------------------------------------------------
async function openThread(otherUid, propertyId, propertyTitle) {
    const container = document.getElementById('chatContainer');
    activeChatId = chatIdFor(currentUser.uid, otherUid);

    clearMessageNotificationsFrom(otherUid);

    try {
        const [myDoc, otherDoc] = await Promise.all([
            db.collection('users').doc(currentUser.uid).get(),
            db.collection('users').doc(otherUid).get()
        ]);
        const myName = myDoc.exists ? myDoc.data().name : 'You';
        const myPhoto = myDoc.exists ? myDoc.data().profilePictureUrl : null;
        const otherName = otherDoc.exists ? otherDoc.data().name : 'VerifyStay User';
        const otherPhoto = otherDoc.exists ? otherDoc.data().profilePictureUrl : null;

        const chatRef = db.collection('chats').doc(activeChatId);
        const chatDoc = await chatRef.get();

        if (!chatDoc.exists) {
            await chatRef.set({
                participants: [currentUser.uid, otherUid],
                participantNames: { [currentUser.uid]: myName, [otherUid]: otherName },
                participantPhotos: { [currentUser.uid]: myPhoto || null, [otherUid]: otherPhoto || null },
                propertyId: propertyId || null,
                propertyTitle: propertyTitle || null,
                lastMessage: '',
                lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastSenderId: null,
                unreadBy: { [currentUser.uid]: 0, [otherUid]: 0 }
            });
        } else {
            // Reset MY unread count now that I've opened this thread
            await chatRef.update({ [`unreadBy.${currentUser.uid}`]: 0 });
        }

        container.innerHTML = `
            <div class="chat-thread-header">
                <a href="chat.html" style="text-decoration:none;color:var(--navy);font-size:20px;">←</a>
                <div class="avatar">${otherPhoto ? `<img src="${otherPhoto}" alt="">` : '👤'}</div>
                <div>
                    <div style="font-weight:600;">${escapeHtml(otherName)}</div>
                    ${propertyTitle ? `<div style="font-size:12px;color:#666;">Re: ${escapeHtml(propertyTitle)}</div>` : ''}
                </div>
            </div>
            <div class="chat-thread">
                <div class="chat-messages" id="chatMessages"><p style="color:#999;">Loading...</p></div>
                <div class="chat-input-row">
                    <input type="text" id="chatInput" placeholder="Type a message...">
                    <button class="btn btn-primary" id="sendBtn">Send</button>
                </div>
            </div>
        `;

        document.getElementById('sendBtn').addEventListener('click', sendMessage);
        document.getElementById('chatInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }
        });

        listenForMessages();
    } catch (error) {
        console.error('Error opening thread:', error);
        container.innerHTML = `<p style="color:#c62828;">Could not open this conversation: ${escapeHtml(error.message)}</p><p style="font-size:13px;color:#999;">If this says "permission" or "insufficient", the Firestore rules need to be republished in Firebase Console.</p>`;
    }
}

function listenForMessages() {
    if (unsubscribeMessages) unsubscribeMessages();
    const messagesDiv = document.getElementById('chatMessages');

    unsubscribeMessages = db.collection('chats').doc(activeChatId).collection('messages')
        .orderBy('createdAt', 'asc')
        .onSnapshot(snapshot => {
            if (snapshot.empty) {
                messagesDiv.innerHTML = '<p style="color:#999;text-align:center;">Say hello 👋</p>';
                return;
            }
            messagesDiv.innerHTML = snapshot.docs.map(doc => {
                const m = doc.data();
                const mine = m.senderId === currentUser.uid;
                const when = m.createdAt ? formatMessageTime(m.createdAt.toDate()) : 'Sending...';
                return `
                    <div class="msg-bubble ${mine ? 'msg-mine' : 'msg-theirs'}">
                        <div>${escapeHtml(m.text)}</div>
                        <div class="msg-time">${when}</div>
                    </div>
                `;
            }).join('');
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }, error => {
            console.error('Message listener error:', error);
        });
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    const otherUid = activeChatId.split('_').find(id => id !== currentUser.uid);

    try {
        await db.collection('chats').doc(activeChatId).collection('messages').add({
            senderId: currentUser.uid,
            text: text,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await db.collection('chats').doc(activeChatId).update({
            lastMessage: text,
            lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastSenderId: currentUser.uid,
            [`unreadBy.${otherUid}`]: firebase.firestore.FieldValue.increment(1)
        });

        // In-app notification for the recipient (shows in their bell/badge)
        const senderDoc = await db.collection('users').doc(currentUser.uid).get();
        const senderName = senderDoc.exists ? senderDoc.data().name : 'someone';
        await createNotification(otherUid, 'message', `New message from ${senderName}`, `chat.html?with=${currentUser.uid}`);
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Could not send message: ' + error.message);
    }
}

window.addEventListener('beforeunload', () => {
    if (unsubscribeMessages) unsubscribeMessages();
});
