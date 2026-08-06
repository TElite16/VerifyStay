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
            const coverUrl = (data.photoUrls && data.photoUrls.length) ? data.photoUrls[data.coverIndex || 0] : null;
            const thumb = coverUrl
                ? `<div class="thumb" style="background-image:url('${coverUrl}');background-size:cover;background-position:center;"></div>`
                : `<div class="thumb">🏠</div>`;

            grid.innerHTML += `
                <a href="property-details.html?id=${doc.id}" class="property-card">
                    ${thumb}
                    <div class="info">
                        <h3>${escapeHtml(data.title || 'Property')}</h3>
                        <p class="location">📍 ${data.area ? escapeHtml(data.area) + ', ' : ''}${escapeHtml(data.city || '')}</p>
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

// Only signed-in users can browse listings — logged-out visitors on the
// homepage see a locked prompt instead of real property data.
function showLockedProperties() {
    const grid = document.getElementById('propertyGrid');
    if (!grid) return;
    grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:40px;">
            <p style="font-size:40px;">🔒</p>
            <p style="margin-bottom:16px;color:#555;">Sign in to see verified listings across Nigeria.</p>
            <a href="login.html?mode=login" class="btn btn-outline" style="margin-right:10px;">Login</a>
            <a href="login.html" class="btn btn-primary">Sign Up Free</a>
        </div>
    `;
}

// Points every "VerifyStay" logo link at the right place depending on
// whether the visitor is signed in: Browse Properties if logged in,
// the public homepage if not — works the same on every page since app.js
// is loaded everywhere.
function syncLogoLink(user) {
    document.querySelectorAll('a.logo').forEach(a => {
        a.href = user ? 'feed.html' : 'index.html';
    });
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

// This runs on EVERY page (app.js is loaded everywhere) so the logo always
// points to the right place. On index.html specifically, it also decides
// whether to show real listings or the locked/sign-in prompt.
auth.onAuthStateChanged((user) => {
    syncLogoLink(user);

    const grid = document.getElementById('propertyGrid');
    if (grid) {
        if (user) {
            loadFeaturedProperties();
        } else {
            showLockedProperties();
        }
    }
});
