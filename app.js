// =====================
// VERIFYSTAY - Main App Logic (index.html only)
// =====================

function searchProperties() {
    const query = document.getElementById('searchInput').value.trim();
    if (query) {
        window.location.href = `feed.html?q=${encodeURIComponent(query)}`;
    } else {
        window.location.href = 'feed.html';
    }
}

function starString(rating) {
    const r = Math.round(rating || 0);
    return '★'.repeat(r) + '☆'.repeat(5 - r);
}

// Points every "VerifyStay" logo link at the right place depending on
// whether the visitor is signed in: Browse Properties if logged in,
// the public homepage if not — works the same on every page since app.js
// is loaded everywhere.
function syncLogoLink(user) {
    document.querySelectorAll('a.logo').forEach(a => {
        a.href = user ? 'feed.html' : 'login.html';
    });
}

// Adds a "← Back" button at the top-left of the navbar on every page except
// the homepage, so people don't feel stuck after tapping into Rules, a
// property, dashboard sections, etc. Falls back to a sensible page (not
// just closing the tab) when there's no real history to go back to —
// e.g. someone opened the page fresh from a bookmark or shared link.
// Small clickable profile-picture circle placed directly beside the logo
// (left-aligned together, not floating center) — tapping it goes to your
// profile, same as tapping your photo in the side drawer.
function injectNavAvatar(photoUrl) {
    if (document.getElementById('navAvatar')) return;
    const logo = document.querySelector('.navbar a.logo');
    if (!logo) return;

    const avatar = document.createElement('a');
    avatar.id = 'navAvatar';
    avatar.href = 'profile.html';
    avatar.style.cssText = 'width:30px;height:30px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#F7F8FA;border:2px solid #C9A227;margin-right:8px;flex-shrink:0;font-size:15px;';
    avatar.innerHTML = photoUrl ? `<img src="${photoUrl}" alt="" style="width:100%;height:100%;object-fit:cover;">` : '👤';
    logo.parentElement.insertBefore(avatar, logo);
}

function injectBackButton(fallbackHref) {
    const isHome = /(^|\/)index\.html$/.test(window.location.pathname) || window.location.pathname.endsWith('/');
    if (isHome) return;
    if (document.getElementById('navBackBtn')) return; // don't double-inject

    const container = document.querySelector('.navbar .container');
    if (!container) return;

    const btn = document.createElement('button');
    btn.id = 'navBackBtn';
    btn.setAttribute('aria-label', 'Go back');
    btn.textContent = '←';
    btn.style.cssText = 'background:none;border:none;font-size:22px;color:#0F2C59;cursor:pointer;padding:4px 10px 4px 0;margin-right:4px;line-height:1;';
    btn.addEventListener('click', () => {
        if (window.history.length > 1 && document.referrer.includes(window.location.host)) {
            window.history.back();
        } else {
            window.location.href = fallbackHref;
        }
    });
    container.insertBefore(btn, container.firstChild);
}

// Builds and injects the slide-out side navigation drawer (hamburger menu)
// on every page once we know who's logged in. Gives quick access to
// Dashboard, Profile, listings, Rules, and more from anywhere in the app.
async function injectSideDrawer(user) {
    if (!user) return;
    if (document.getElementById('sideDrawer')) return; // don't double-inject

    const navLinks = document.querySelector('.navbar .nav-links');
    if (!navLinks) return;

    let name = 'My Account';
    let role = '';
    let photoUrl = null;
    try {
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            const d = doc.data();
            name = d.name || name;
            role = d.role || '';
            photoUrl = d.profilePictureUrl || null;
        }
    } catch (e) { console.warn('Could not load user info for drawer:', e); }

    injectNavAvatar(photoUrl);

    const myListingsLabel = role === 'tenant' ? 'My Applications' : 'My Properties';

    // Hamburger toggle button, added at the end of the existing nav links
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'sideDrawerBtn';
    toggleBtn.setAttribute('aria-label', 'Open menu');
    toggleBtn.textContent = '☰';
    navLinks.appendChild(toggleBtn);

    // Overlay + drawer panel
    const overlay = document.createElement('div');
    overlay.id = 'sideDrawerOverlay';

    const drawer = document.createElement('div');
    drawer.id = 'sideDrawer';
    drawer.innerHTML = `
        <div class="drawer-header">
            ${photoUrl
                ? `<img src="${photoUrl}" alt="">`
                : `<div class="avatar-fallback">👤</div>`}
            <div>
                <div class="name">${escapeHtml(name)}</div>
                <div class="role">${escapeHtml(role)}</div>
            </div>
            <button id="sideDrawerCloseBtn" aria-label="Close menu">✕</button>
        </div>

        <div class="drawer-section-label">Menu</div>
        <a class="drawer-link" href="dashboard.html">📊 Dashboard</a>
        <a class="drawer-link" href="dashboard.html#properties">📋 ${myListingsLabel}</a>
        <a class="drawer-link" href="feed.html">${role === 'tenant' ? '🔍 Browse Properties' : '🏬 Market'}</a>
        <a class="drawer-link" href="profile.html">👤 My Profile</a>
        <a class="drawer-link" href="agreements.html">📝 My Agreements</a>

        <div class="drawer-section-label">Help &amp; Support</div>
        <a class="drawer-link" href="rules.html">📜 Platform Rules</a>
        <a class="drawer-link" href="notifications.html">🔔 Notifications <span class="soon" id="notifBadge" style="background:#c62828;color:#fff;display:none;"></span></a>
        <a class="drawer-link" href="chat.html">💬 Messages</a>
        <a class="drawer-link" href="#">🆘 Support <span class="soon">Soon</span></a>

        <div style="margin-top:auto;"></div>
        <a class="drawer-link logout" href="#" id="drawerLogoutLink">🚪 Logout</a>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    function openDrawer() { drawer.classList.add('open'); overlay.classList.add('open'); }
    function closeDrawer() { drawer.classList.remove('open'); overlay.classList.remove('open'); }

    toggleBtn.addEventListener('click', openDrawer);
    overlay.addEventListener('click', closeDrawer);
    document.getElementById('sideDrawerCloseBtn').addEventListener('click', closeDrawer);
    document.getElementById('drawerLogoutLink').addEventListener('click', function (e) {
        e.preventDefault();
        logout();
    });
}


function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
window.escapeHtml = escapeHtml;
window.starString = starString;

// Shared Cloudinary upload helper — used by post-property.js, login.js
// (profile picture on signup), and profile.js (updating profile picture).
async function uploadFile(file, folder) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', window.CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', folder);

    const response = await fetch(
        `https://api.cloudinary.com/v1_1/${window.CLOUDINARY_CLOUD_NAME}/auto/upload`,
        { method: 'POST', body: formData }
    );

    if (!response.ok) {
        const errText = await response.text();
        throw new Error('Upload failed: ' + errText);
    }

    const data = await response.json();
    return data.secure_url;
}
window.uploadFile = uploadFile;

// ---------------------------------------------------------------
// BLACK FLAGS / BANS
// strikeCount = "black flags" (admin-issued, private, only the account
// owner sees their own count). Every 3 black flags triggers a ban:
// 2 weeks the first time, 4 weeks the second, 6 the third, etc.
// There's no paid backend to run this on a schedule, so instead this
// check runs from ANY browser that touches that account — the owner's
// own dashboard loading, or someone else viewing their public profile.
// The Firestore rule only accepts the exact correct math, so this can't
// be gamed into a fake/short ban or skipped by editing the request.
// ---------------------------------------------------------------
async function checkAndApplyBan(uid) {
    try {
        const ref = db.collection('users').doc(uid);
        const doc = await ref.get();
        if (!doc.exists) return;
        const d = doc.data();
        const strikeCount = d.strikeCount || 0;
        const banCount = d.banCount || 0;
        const now = new Date();
        const suspendedUntil = d.suspendedUntil ? d.suspendedUntil.toDate() : null;
        const currentlySuspended = suspendedUntil && suspendedUntil > now;
        const nextBanThreshold = 3 * (banCount + 1);

        if (!currentlySuspended && strikeCount >= nextBanThreshold) {
            const newBanCount = banCount + 1;
            const newSuspendedUntil = new Date(now.getTime() + newBanCount * 14 * 24 * 60 * 60 * 1000);
            await ref.update({
                banCount: newBanCount,
                suspendedUntil: firebase.firestore.Timestamp.fromDate(newSuspendedUntil)
            });
        }
    } catch (e) {
        // Expected to fail silently for anyone not yet due a ban — the
        // security rule rejects the write, which is normal, not an error.
    }
}
window.checkAndApplyBan = checkAndApplyBan;

// Counts PUBLIC "red flags" (user-submitted reports) against a person.
// Never exposes who filed them or what they said — just the count and
// a rough breakdown by category, so a profile visitor gets a signal
// without exposing any reporter's identity.
async function getRedFlagSummary(uid) {
    try {
        const snapshot = await db.collection('flags')
            .where('targetType', '==', 'user')
            .where('targetId', '==', uid)
            .get();
        const byType = {};
        snapshot.forEach(doc => {
            const t = doc.data().violationType || 'other';
            byType[t] = (byType[t] || 0) + 1;
        });
        return { count: snapshot.size, byType: byType };
    } catch (e) {
        console.warn('Could not load red flag summary:', e);
        return { count: 0, byType: {} };
    }
}
window.getRedFlagSummary = getRedFlagSummary;

// Returns the badge HTML for a property listing under the new instant-
// publish model: shows "Not yet verified" for exactly 4 hours after
// verificationWindowStart, then nothing (not a red flag, just quietly
// stops showing — the property is simply live). Falls back to createdAt
// for any listing posted before this field existed.
function getListingBadge(data) {
    const startField = data.verificationWindowStart || data.createdAt;
    if (!startField || !startField.toDate) return '';
    const start = startField.toDate();
    const hoursSince = (Date.now() - start.getTime()) / (1000 * 60 * 60);
    if (hoursSince < 4) {
        return `<span class="badge badge-pending">🕓 Not yet verified</span>`;
    }
    return '';
}
window.getListingBadge = getListingBadge;

// Shows "X of Y units available" for multi-unit buildings only — a
// standalone single-unit listing (the normal case) shows nothing extra.
function getUnitsInfo(data) {
    const total = data.unitsTotal || 1;
    if (total <= 1) return '';
    const available = (typeof data.unitsAvailable === 'number') ? data.unitsAvailable : total;
    if (available <= 0) {
        return `<span class="badge" style="background:#ffebee;color:#c62828;">Fully occupied (0/${total})</span>`;
    }
    return `<span class="badge" style="background:#e8f5e9;color:#2e7d32;">${available} of ${total} units available</span>`;
}
window.getUnitsInfo = getUnitsInfo;

// The one place the rent breakdown formula lives, so it's identical
// everywhere it's shown (Market, Dashboard, property page):
//   - House Rent: whatever the landlord/agent set
//   - Service/Repair Fee: 10% of rent normally, drops to 5% next renewal
//     for a tenant who logged 0-1 repair requests all year (loyalty
//     discount — computed per-tenancy, not shown on general listings)
//   - Commission: agent listings only — whatever % the agent chose to
//     charge (was a fixed 20%, now agent-set; capped by state to
//     qualify for the Caretaker Role, see getCommissionCap)
function getPriceBreakdown(p, serviceFeePercent) {
    const rent = p.price || 0;
    const feePercent = (typeof serviceFeePercent === 'number') ? serviceFeePercent : 5;
    const serviceFee = Math.round(rent * (feePercent / 100));

    // Commission applies either when an agent posted the listing directly,
    // OR when a landlord's listing has an accepted Caretaker Agreement
    // assigning an agent to manage it.
    const isAgentListing = p.ownerRole === 'agent';
    const hasCaretaker = p.ownerRole === 'landlord' && p.caretakerRoleActive;
    const commissionPercent = isAgentListing
        ? (typeof p.commissionPercent === 'number' ? p.commissionPercent : 10)
        : hasCaretaker
            ? (typeof p.caretakerCommissionPercent === 'number' ? p.caretakerCommissionPercent : 10)
            : 0;
    const commissionFee = (isAgentListing || hasCaretaker) ? Math.round(rent * (commissionPercent / 100)) : 0;

    // VerifyStay's platform fee — 5% of rent, covers escrow/transaction
    // processing costs plus platform revenue. Held in escrow alongside
    // everyone else's share, released only on check-in (see escrow flow).
    const verifyStayFeePercent = 5;
    const verifyStayFee = Math.round(rent * (verifyStayFeePercent / 100));

    const total = rent + serviceFee + commissionFee + verifyStayFee;
    return {
        rent, serviceFee, serviceFeePercent: feePercent,
        commissionFee, commissionPercent,
        verifyStayFee, verifyStayFeePercent,
        total, isAgentListing: isAgentListing || hasCaretaker
    };
}
window.getPriceBreakdown = getPriceBreakdown;

// Single switch for the whole app — flip to true only once a real
// escrow provider (e.g. Vesicash) is actually integrated with real API
// credentials. Referenced by contract.js and property-details.js so
// there's exactly one place to turn this on later.
window.ESCROW_LIVE = false;

// Compact one-line version for listing cards (Market/Dashboard tiles) —
// full line-by-line breakdown is reserved for the property detail page,
// where there's room to show it properly.
function getPriceSummaryHtml(p) {
    const b = getPriceBreakdown(p);
    return `
        <p class="price">₦${b.rent.toLocaleString()}/year<span style="font-weight:400;color:#666;font-size:12px;"> + fees</span></p>
        <p style="font-size:12px;color:#666;">Total incl. fees: ₦${b.total.toLocaleString()}/year</p>
    `;
}
window.getPriceSummaryHtml = getPriceSummaryHtml;

// Looks up the Caretaker Role commission cap for a given state. Only
// states you've verified and added via Firebase Console will have a
// real entry — everything else falls back to the platform default (10%,
// matching Lagos's confirmed LASRERA cap) until you confirm otherwise.
async function getCommissionCap(state) {
    if (!state) return 10;
    try {
        const doc = await db.collection('stateCommissionCaps').doc(state).get();
        if (doc.exists && typeof doc.data().capPercent === 'number') {
            return doc.data().capPercent;
        }
    } catch (e) {
        console.warn('Could not load commission cap, using default:', e);
    }
    return 10;
}
window.getCommissionCap = getCommissionCap;

// ---------------------------------------------------------------
// CHAT + NOTIFICATIONS (Fiverr-style: applying to a property or tapping
// "Message" on a profile opens a thread; a bell shows unread count)
// ---------------------------------------------------------------

// Deterministic chat ID so the same two people (about the same property,
// if any) always land in the SAME thread — no duplicate conversations.
function buildChatId(uidA, uidB, propertyId) {
    const sorted = [uidA, uidB].sort();
    return propertyId ? `${sorted[0]}_${sorted[1]}_${propertyId}` : `${sorted[0]}_${sorted[1]}`;
}

// Creates the chat doc if it doesn't exist yet, then returns its ID.
async function getOrCreateChat(myUid, otherUid, propertyId, propertyTitle) {
    const chatId = buildChatId(myUid, otherUid, propertyId || null);
    const ref = db.collection('chats').doc(chatId);
    const doc = await ref.get();
    if (!doc.exists) {
        await ref.set({
            participants: [myUid, otherUid],
            propertyId: propertyId || null,
            propertyTitle: propertyTitle || null,
            lastMessage: '',
            lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastMessageBy: null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    return chatId;
}
window.getOrCreateChat = getOrCreateChat;

// Sends a message in an existing chat and updates the thread preview.
async function sendChatMessage(chatId, senderId, text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    await db.collection('chats').doc(chatId).collection('messages').add({
        senderId: senderId,
        text: trimmed,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        read: false
    });
    await db.collection('chats').doc(chatId).update({
        lastMessage: trimmed,
        lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastMessageBy: senderId
    });
}
window.sendChatMessage = sendChatMessage;

// Creates an in-app notification for someone else (new message, new
// application, etc). `link` is where tapping the notification goes.
async function createNotification(userId, type, text, link) {
    try {
        await db.collection('notifications').add({
            userId: userId,
            type: type,
            text: text,
            link: link,
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) {
        console.warn('Could not create notification:', e);
    }
}
window.createNotification = createNotification;

// Live-updates the notification badge count in the sidebar drawer,
// and plays a soft sound for a NEW unread notification while the app
// is open (this only works while the tab is open, not a true push
// notification — that needs extra setup we're holding off on for now).
let lastKnownUnreadCount = null;
function watchNotificationBadge(uid) {
    db.collection('notifications')
        .where('userId', '==', uid)
        .where('read', '==', false)
        .onSnapshot(snapshot => {
            const count = snapshot.size;
            const badge = document.getElementById('notifBadge');
            if (badge) badge.textContent = count > 0 ? count : '';
            if (badge) badge.style.display = count > 0 ? 'inline-block' : 'none';

            if (lastKnownUnreadCount !== null && count > lastKnownUnreadCount) {
                playNotificationSound();
            }
            lastKnownUnreadCount = count;
        }, err => console.warn('Notification badge listener error:', err));
}

function playNotificationSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
    } catch (e) { /* audio not available, silently skip */ }
}

function logout() {
    auth.signOut().then(() => {
        window.location.href = 'login.html';
    }).catch((error) => {
        console.error('Logout error:', error);
    });
}

window.searchProperties = searchProperties;
window.logout = logout;

// This runs on EVERY page (app.js is loaded everywhere) so the logo always
// points to the right place. On index.html specifically, it also decides
// whether to show real listings or the locked/sign-in prompt.
auth.onAuthStateChanged(async (user) => {
    syncLogoLink(user);
    injectBackButton(user ? 'dashboard.html' : 'login.html');
    await injectSideDrawer(user);

    const browseCta = document.getElementById('browseCta');
    if (browseCta) {
        browseCta.href = user ? 'feed.html' : 'login.html?mode=login';
    }

    if (user) {
        await checkAndApplyBan(user.uid);
        await renderSuspensionBanner(user.uid);
        watchNotificationBadge(user.uid);
    }
});

// Shows a fixed banner across the top of the page if the logged-in
// user is currently suspended, so they always know their status —
// doesn't log them out, just makes the ban visible everywhere.
async function renderSuspensionBanner(uid) {
    if (document.getElementById('suspensionBanner')) return;
    try {
        const doc = await db.collection('users').doc(uid).get();
        if (!doc.exists) return;
        const d = doc.data();
        const suspendedUntil = d.suspendedUntil ? d.suspendedUntil.toDate() : null;
        if (!suspendedUntil || suspendedUntil <= new Date()) return;

        const banner = document.createElement('div');
        banner.id = 'suspensionBanner';
        banner.style.cssText = 'position:sticky;top:0;z-index:997;background:#c62828;color:#fff;text-align:center;padding:10px 14px;font-size:14px;';
        banner.textContent = `⚠️ Your account is suspended until ${suspendedUntil.toLocaleDateString()} due to admin flags on your account.`;
        document.body.insertBefore(banner, document.body.firstChild);
    } catch (e) {
        console.warn('Could not check suspension status:', e);
    }
}
