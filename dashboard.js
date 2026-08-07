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
            { icon: '⭐', label: 'My Ratings Given', link: 'profile.html' },
            { icon: '🚩', label: 'Report an Issue', link: 'dispute.html' }
        ];
        document.getElementById('listingTitle').textContent = 'Properties You Applied To';
    } else if (role === 'landlord') {
        actions = [
            { icon: '➕', label: 'Post Property', link: 'post-property.html' },
            { icon: '📋', label: 'My Properties', link: '#properties' },
            { icon: '⚖️', label: 'Raise Dispute with Agent', link: 'dispute.html' }
        ];
        document.getElementById('listingTitle').textContent = 'Your Properties';
    } else if (role === 'agent') {
        actions = [
            { icon: '➕', label: 'Post Property', link: 'post-property.html' },
            { icon: '📋', label: 'Managed Properties', link: '#properties' },
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

        let html = '';
        // For tenants, applications don't carry a full property snapshot,
        // so we look up each linked property's basic info to display.
        for (const doc of snapshot.docs) {
            const data = doc.data();
            let title = data.title;
            let propertyId = doc.id;
            let status = data.status || 'pending';

            if (role === 'tenant') {
                propertyId = data.propertyId;
                status = data.status || 'pending';
                try {
                    const propDoc = await db.collection('properties').doc(data.propertyId).get();
                    title = propDoc.exists ? propDoc.data().title : 'Property';
                } catch (e) {
                    title = 'Property';
                }
            }

            html += `
                <div class="listing-item">
                    <div>
                        <strong>${escapeHtml(title || 'Property')}</strong>
                    </div>
                    <div>
                        <span class="status-badge ${status === 'active' ? 'status-active' : status === 'flagged' ? 'status-flagged' : 'status-pending'}">
                            ${escapeHtml(status)}
                        </span>
                        <a href="property-details.html?id=${propertyId}" style="margin-left: 12px;">View →</a>
                        ${role !== 'tenant' ? `<a href="post-property.html?edit=${propertyId}" style="margin-left: 12px;">✏️ Edit</a>` : ''}
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading listings:', error);
        container.innerHTML = '<p style="color: #c62828;">Error loading listings. Please refresh.</p>';
    }
}
