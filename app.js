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

async function loadFeaturedProperties() {
    const grid = document.getElementById('propertyGrid');
    if (!grid) return;

    try {
        const snapshot = await db.collection('properties')
            .where('status', '==', 'active')
            .limit(6)
            .get();

        grid.innerHTML = '';

        if (snapshot.empty) {
            grid.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:40px;color:#999;">
                    <p style="font-size:40px;">🏠</p>
                    <p>No verified properties yet. Be the first to list!</p>
                </div>
            `;
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const rating = data.rating || 0;

            grid.innerHTML += `
                <a href="property-details.html?id=${doc.id}" class="property-card">
                    <div class="thumb">🏠</div>
                    <div class="info">
                        <h3>${escapeHtml(data.title || 'Property')}</h3>
                        <p class="location">📍 ${escapeHtml(data.city || '')}${data.address ? `, ${escapeHtml(data.address)}` : ''}</p>
                        <p class="price">₦${(data.price || 0).toLocaleString()}/year</p>
                        <p class="rating">${starString(rating)} ${rating.toFixed(1)}</p>
                        ${data.verified ? `<span class="badge badge-verified">✅ Verified</span>` : `<span class="badge badge-pending">Pending review</span>`}
                    </div>
                </a>
            `;
        });
    } catch (error) {
        console.error('Error loading properties:', error);
        grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#c62828;">Error loading properties. Please refresh.</p>';
    }
}

// Basic escaping so user-entered text can never break the page or inject HTML
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
window.escapeHtml = escapeHtml;
window.starString = starString;

function logout() {
    auth.signOut().then(() => {
        window.location.href = 'index.html';
    }).catch((error) => {
        console.error('Logout error:', error);
    });
}

window.searchProperties = searchProperties;
window.logout = logout;

document.addEventListener('DOMContentLoaded', () => {
    loadFeaturedProperties();
});
