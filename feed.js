// =====================
// VERIFYSTAY - Browse/Feed Logic
// =====================

let allProperties = [];

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const q = urlParams.get('q');
    if (q) document.getElementById('searchBox').value = q;

    await loadProperties();
    applyFilters();
});

async function loadProperties() {
    const grid = document.getElementById('feedGrid');
    try {
        const snapshot = await db.collection('properties')
            .where('status', '==', 'active')
            .get();

        allProperties = [];
        snapshot.forEach(doc => allProperties.push({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Error loading properties:', error);
        grid.innerHTML = '<p style="color:#c62828;">Error loading properties. Please refresh.</p>';
    }
}

function applyFilters() {
    const grid = document.getElementById('feedGrid');
    const searchTerm = document.getElementById('searchBox').value.trim().toLowerCase();
    const city = document.getElementById('cityFilter').value;

    let filtered = allProperties.filter(p => {
        const matchesSearch = !searchTerm ||
            (p.title || '').toLowerCase().includes(searchTerm) ||
            (p.address || '').toLowerCase().includes(searchTerm) ||
            (p.city || '').toLowerCase().includes(searchTerm);
        const matchesCity = !city || p.city === city;
        return matchesSearch && matchesCity;
    });

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:40px;color:#999;">
                <p style="font-size:40px;">🔍</p>
                <p>No properties match your search.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(p => {
        const rating = p.rating || 0;
        return `
            <a href="property-details.html?id=${p.id}" class="property-card">
                <div class="thumb">🏠</div>
                <div class="info">
                    <h3>${escapeHtml(p.title || 'Property')}</h3>
                    <p class="location">📍 ${escapeHtml(p.city || '')}${p.address ? `, ${escapeHtml(p.address)}` : ''}</p>
                    <p class="price">₦${(p.price || 0).toLocaleString()}/year</p>
                    <p class="rating">${starString(rating)} ${rating.toFixed(1)}</p>
                    ${p.verified ? `<span class="badge badge-verified">✅ Verified</span>` : `<span class="badge badge-pending">Pending review</span>`}
                </div>
            </a>
        `;
    }).join('');
}

window.applyFilters = applyFilters;
