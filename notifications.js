// =====================
// VERIFYSTAY - Notifications List
// =====================

let currentUser = null;

auth.onAuthStateChanged((user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = user;
    renderNotifications();
});

async function renderNotifications() {
    const container = document.getElementById('notifContainer');
    try {
        const snapshot = await db.collection('notifications')
            .where('userId', '==', currentUser.uid)
            .get();

        if (snapshot.empty) {
            container.innerHTML = `<h2>🔔 Notifications</h2><p style="color:#999;text-align:center;padding:30px 0;">Nothing here yet.</p>`;
            return;
        }

        const notifs = [];
        snapshot.forEach(doc => notifs.push({ id: doc.id, ...doc.data() }));
        notifs.sort((a, b) => {
            const ta = a.createdAt ? a.createdAt.toMillis() : 0;
            const tb = b.createdAt ? b.createdAt.toMillis() : 0;
            return tb - ta;
        });

        const iconFor = (type) => type === 'message' ? '💬'
            : type === 'application' ? '📋'
            : type === 'contract' ? '📝'
            : type === 'caretaker-debt' ? '💰'
            : type === 'repair' ? '🔧'
            : type === 'tenancy' ? '🏠'
            : '🔔';

        const items = notifs.map(n => {
            const when = n.createdAt ? n.createdAt.toDate().toLocaleString() : '';
            return `
                <a href="${n.link || '#'}" class="notif-item ${n.read ? '' : 'unread'}" onclick="goToNotification(event,'${n.id}','${n.link || '#'}')">
                    <span class="icon">${iconFor(n.type)}</span>
                    <div class="body">
                        <div>${escapeHtml(n.text || '')}</div>
                        <div class="time">${when}</div>
                    </div>
                </a>
            `;
        }).join('');

        const unreadCount = notifs.filter(n => !n.read).length;
        const markAllBtn = unreadCount > 0
            ? `<button class="btn btn-outline" style="margin-bottom:14px;" onclick="markAllRead()">Mark all ${unreadCount} as read</button>`
            : '';

        container.innerHTML = `<h2>🔔 Notifications</h2>${markAllBtn}${items}`;
    } catch (error) {
        console.error('Error loading notifications:', error);
        container.innerHTML = '<p style="color:#c62828;">Could not load notifications.</p>';
    }
}

// Clicking a notification used to navigate away instantly, which raced
// against (and usually beat) the "mark as read" save — so it never
// actually saved. Now we stop the navigation, save read:true first, and
// only then move to the linked page.
async function markAllRead() {
    try {
        const snapshot = await db.collection('notifications')
            .where('userId', '==', currentUser.uid)
            .where('read', '==', false)
            .get();
        await Promise.all(snapshot.docs.map(doc => doc.ref.update({ read: true })));
        renderNotifications();
    } catch (e) {
        console.warn('Could not mark all as read:', e);
    }
}
window.markAllRead = markAllRead;

async function goToNotification(event, notifId, link) {
    event.preventDefault();
    try {
        await db.collection('notifications').doc(notifId).update({ read: true });
    } catch (e) {
        console.warn('Could not mark notification read:', e);
    }
    window.location.href = link;
}
window.goToNotification = goToNotification;

async function markRead(notifId) {
    try {
        await db.collection('notifications').doc(notifId).update({ read: true });
    } catch (e) {
        console.warn('Could not mark notification read:', e);
    }
}
window.markRead = markRead;
