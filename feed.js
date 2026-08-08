// =====================
// VERIFYSTAY - Browse/Feed Logic
// =====================

let allProperties = [];
let filteredProperties = [];
let currentPage = 1;
const PAGE_SIZE = 30; // 5 columns x 6 rows on wide screens

auth.onAuthStateChanged((user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    initFeed();
});

async function initFeed() {
    const urlParams = new URLSearchParams(window.location.search);
    const q = urlParams.get('q');
    if (q) document.getElementById('searchBox').value = q;

    await loadProperties();
    applyFilters();

    document.getElementById('prevPageBtn').addEventListener('click', () => {
        if (currentPage > 1) { currentPage--; renderPage(); }
    });
    document.getElementById('nextPageBtn').addEventListener('click', () => {
        const maxPage = Math.ceil(filteredProperties.length / PAGE_SIZE);
        if (currentPage < maxPage) { currentPage++; renderPage(); }
    });
}

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
    const searchTerm = document.getElementById('searchBox').value.trim().toLowerCase();
    const city = document.getElementById('cityFilter').value;

    filteredProperties = allProperties.filter(p => {
        const matchesSearch = !searchTerm ||
            (p.title || '').toLowerCase().includes(searchTerm) ||
            (p.area || '').toLowerCase().includes(searchTerm) ||
            (p.address || '').toLowerCase().includes(searchTerm) ||
            (p.city || '').toLowerCase().includes(searchTerm);
        const matchesCity = !city || p.city === city;
        return matchesSearch && matchesCity;
    });

    currentPage = 1;
    renderPage();
}

function renderPage() {
    const grid = document.getElementById('feedGrid');
    const pagination = document.getElementById('paginationControls');

    if (filteredProperties.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:40px;color:#999;">
                <p style="font-size:40px;">🔍</p>
                <p>No properties match your search.</p>
            </div>
        `;
        pagination.style.display = 'none';
        return;
    }

    const maxPage = Math.ceil(filteredProperties.length / PAGE_SIZE);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filteredProperties.slice(start, start + PAGE_SIZE);

    grid.innerHTML = pageItems.map(p => {
        const rating = p.rating || 0;
        const coverUrl = (p.photoUrls && p.photoUrls.length) ? p.photoUrls[p.coverIndex || 0] : null;
        const thumb = coverUrl
            ? `<div class="thumb" style="background-image:url('${coverUrl}');background-size:cover;background-position:center;"></div>`
            : `<div class="thumb">🏠</div>`;
        return `
            <a href="property-details.html?id=${p.id}" class="property-card">
                ${thumb}
                <div class="info">
                    <h3>${escapeHtml(p.title || 'Property')}</h3>
                    <p class="location">📍 ${p.area ? escapeHtml(p.area) + ', ' : ''}${escapeHtml(p.city || '')}</p>
                    <p class="price">₦${(p.price || 0).toLocaleString()}/year</p>
                    <p class="rating">${starString(rating)} ${rating.toFixed(1)}</p>
                    ${getListingBadge(p)}
                </div>
            </a>
        `;
    }).join('');

    pagination.style.display = maxPage > 1 ? 'flex' : 'none';
    document.getElementById('pageIndicator').textContent = `Page ${currentPage} of ${maxPage}`;
    document.getElementById('prevPageBtn').disabled = currentPage <= 1;
    document.getElementById('nextPageBtn').disabled = currentPage >= maxPage;
    window.scrollTo({ top: grid.offsetTop - 80, behavior: 'smooth' });
}

window.applyFilters = applyFilters;
