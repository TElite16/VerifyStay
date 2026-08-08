// =====================
// VERIFYSTAY - Dashboard Logic
// =====================

let currentUser = null;
let currentUserData = null;

auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = user;
    await loadUserData(user.uid);
    setupDashboard();
    loadListings();
    loadAnnouncement();
});

// Shows the newest active announcement (posted by you via Firebase Console).
// A user who dismisses it won't see the SAME announcement again on this device.
async function loadAnnouncement() {
    const banner = document.getElementById('announcementBanner');
    try {
        const snapshot = await db.collection('announcements')
            .where('active', '==', true)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();

        if (snapshot.empty) return;

        const doc = snapshot.docs[0];
        const data = doc.data();
        const dismissedId = localStorage.getItem('verifystay_dismissed_announcement');
        if (dismissedId === doc.id) return;

        banner.innerHTML = `
            <div class="announcement-banner">
                <span>📢 ${escapeHtml(data.title || '')}${data.body ? ' — ' + escapeHtml(data.body) : ''}</span>
                <button onclick="dismissAnnouncement('${doc.id}')">✕</button>
            </div>
        `;
    } catch (error) {
        console.error('Error loading announcement:', error);
    }
}

function dismissAnnouncement(id) {
    localStorage.setItem('verifystay_dismissed_announcement', id);
    document.getElementById('announcementBanner').innerHTML = '';
}
window.dismissAnnouncement = dismissAnnouncement;

async function loadUserData(uid) {
    try {
        const doc = await db.collection('users').doc(uid).get();
        if (doc.exists) {
            currentUserData = doc.data();
            document.getElementById('userName').textContent = currentUserData.name || 'User';
            document.getElementById('userRole').textContent = currentUserData.role || 'tenant';
            document.getElementById('userRating').textContent = `⭐ ${(currentUserData.rating || 0).toFixed(1)}`;
            document.getElementById('userFlags').textContent = `🚩 ${currentUserData.flags || 0}`;
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

function setupDashboard() {
    const role = currentUserData?.role || 'tenant';
    const actionsDiv = document.getElementById('quickActions');
    let actions = [];

    if (role === 'tenant') {
        actions = [
            { icon: '🔍', label: 'Browse Properties', link: 'feed.html' },
            { icon: '💬', label: 'Messages', link: 'chat.html' },
            { icon: '⭐', label: 'My Ratings Given', link: 'profile.html' },
            { icon: '🚩', label: 'Report an Issue', link: 'dispute.html' }
        ];
        document.getElementById('listingTitle').textContent = 'Properties You Applied To';
    } else if (role === 'landlord') {
        actions = [
            { icon: '➕', label: 'Post Property', link: 'post-property.html' },
            { icon: '📋', label: 'My Properties', link: '#properties' },
            { icon: '🏬', label: 'Market (browse listings)', link: 'feed.html' },
            { icon: '💬', label: 'Messages', link: 'chat.html' },
            { icon: '⚖️', label: 'Raise Dispute with Agent', link: 'dispute.html' }
        ];
        document.getElementById('listingTitle').textContent = 'Your Properties';
    } else if (role === 'agent') {
        actions = [
            { icon: '➕', label: 'Post Property', link: 'post-property.html' },
            { icon: '📋', label: 'Managed Properties', link: '#properties' },
            { icon: '🏬', label: 'Market (browse listings)', link: 'feed.html' },
            { icon: '💬', label: 'Messages', link: 'chat.html' },
            { icon: '⚖️', label: 'Dispute Mediation', link: 'dispute.html' }
        ];
        document.getElementById('listingTitle').textContent = 'Properties You Manage';
    }

    actionsDiv.innerHTML = actions.map(action => `
        <a href="${action.link}" class="action-card">
            <span class="icon">${action.icon}</span>
            <h4>${action.label}</h4>
        </a>
    `).join('');
}

async function loadListings() {
    const container = document.getElementById('listingContainer');
    const role = currentUserData?.role || 'tenant';

    try {
        let snapshot;

        if (role === 'tenant') {
            snapshot = await db.collection('applications')
                .where('tenantId', '==', currentUser.uid)
                .get();
        } else {
            // landlord/agent: their own listed properties
            snapshot = await db.collection('properties')
                .where('ownerId', '==', currentUser.uid)
                .get();
        }

        if (snapshot.empty) {
            container.innerHTML = `
                <p style="color: #999; text-align: center; padding: 40px 0;">
                    ${role === 'tenant' ? "You haven't applied to any properties yet." : "You haven't listed any properties yet."}
                    <br>
                    <a href="${role === 'tenant' ? 'feed.html' : 'post-property.html'}" class="btn btn-primary" style="margin-top: 12px;">
                        ${role === 'tenant' ? 'Browse Properties' : 'Post Your First Property'}
                    </a>
                </p>
            `;
            return;
        }

        // Tile cards, same visual style as Feed/Browse — for tenants we
        // fetch the full property behind each application; for landlords/
        // agents the properties ARE the documents already.
        const cards = [];
        for (const doc of snapshot.docs) {
            const data = doc.data();
            let propertyId, status, property;

            if (role === 'tenant') {
                propertyId = data.propertyId;
                status = data.status || 'pending';
                try {
                    const propDoc = await db.collection('properties').doc(propertyId).get();
                    property = propDoc.exists ? propDoc.data() : { title: 'Property' };
                } catch (e) {
                    property = { title: 'Property' };
                }
            } else {
                propertyId = doc.id;
                status = data.status || 'active';
                property = data;
            }

            const rating = property.rating || 0;
            const coverUrl = (property.photoUrls && property.photoUrls.length) ? property.photoUrls[property.coverIndex || 0] : null;
            const thumb = coverUrl
                ? `<div class="thumb" style="background-image:url('${coverUrl}');background-size:cover;background-position:center;"></div>`
                : `<div class="thumb">🏠</div>`;
            const statusClass = status === 'active' ? 'status-active' : status === 'flagged' ? 'status-flagged' : 'status-pending';

            cards.push(`
                <div class="property-card" style="position:relative;">
                    <span class="status-badge ${statusClass}" style="position:absolute;top:10px;right:10px;background:#fff;z-index:1;">${escapeHtml(status)}</span>
                    <a href="property-details.html?id=${propertyId}" style="text-decoration:none;color:inherit;">
                        ${thumb}
                        <div class="info">
                            <h3>${escapeHtml(property.title || 'Property')}</h3>
                            <p class="location">📍 ${property.area ? escapeHtml(property.area) + ', ' : ''}${escapeHtml(property.city || '')}</p>
                            ${property.price ? `<p class="price">₦${property.price.toLocaleString()}/year</p>` : ''}
                            <p class="rating">${starString(rating)} ${rating.toFixed(1)}</p>
                        </div>
                    </a>
                    ${role !== 'tenant' ? `<div style="padding:0 16px 14px;"><a href="post-property.html?edit=${propertyId}">✏️ Edit</a></div>` : ''}
                </div>
            `);
        }

        container.innerHTML = `<div class="property-grid">${cards.join('')}</div>`;
    } catch (error) {
        console.error('Error loading listings:', error);
        container.innerHTML = '<p style="color: #c62828;">Error loading listings. Please refresh.</p>';
    }
}
