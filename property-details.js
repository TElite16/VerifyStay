// =====================
// VERIFYSTAY - Property Details Logic
// =====================

const urlParams = new URLSearchParams(window.location.search);
const propertyId = urlParams.get('id');
let currentUser = null;
let currentUserRole = null;
let propertyData = null;
let selectedStars = 0;

auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    if (user) {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) currentUserRole = userDoc.data().role;
    }
    loadProperty();
});

async function loadProperty() {
    const card = document.getElementById('detailsCard');
    if (!propertyId) {
        card.innerHTML = '<p>Property not found.</p>';
        return;
    }

    try {
        const doc = await db.collection('properties').doc(propertyId).get();
        if (!doc.exists) {
            card.innerHTML = '<p>This property no longer exists.</p>';
            return;
        }
        propertyData = doc.data();
        renderProperty();
        loadReviews();
    } catch (error) {
        console.error('Error loading property:', error);
        card.innerHTML = '<p style="color:#c62828;">Error loading property.</p>';
    }
}

function renderProperty() {
    const card = document.getElementById('detailsCard');
    const p = propertyData;
    const photos = (p.photoUrls || []).map(url => `<img src="${url}" alt="Property photo">`).join('');

    const applyButton = (currentUserRole === 'tenant')
        ? `<button class="btn btn-primary" onclick="applyToProperty()">Apply / Contact Agent</button>`
        : '';

    card.innerHTML = `
        <h1>${escapeHtml(p.title || 'Property')}</h1>
        <p class="price">₦${(p.price || 0).toLocaleString()}/year</p>
        <p class="location">📍 ${escapeHtml(p.city || '')}${p.address ? `, ${escapeHtml(p.address)}` : ''}</p>
        ${p.verified ? `<span class="badge badge-verified">✅ Verified</span>` : `<span class="badge badge-pending">Pending review</span>`}
        <div class="photo-row">${photos || '<p style="color:#999;">No photos uploaded yet.</p>'}</div>
        <p>${escapeHtml(p.description || '')}</p>
        <p style="margin-top:8px;color:#666;">🛏️ ${p.bedrooms || 0} bedroom(s) &middot; ${escapeHtml(p.propertyType || '')}</p>

        <div id="detailMap"></div>
        <div class="action-row">
            <a class="btn btn-outline" id="directionsBtn" target="_blank" rel="noopener">📍 Get Directions</a>
            ${applyButton}
        </div>
        <p><span class="flag-link" onclick="reportProperty()">🚩 Report this listing</span></p>

        <div class="review-section">
            <h3>Ratings <span id="avgRating"></span></h3>
            ${currentUserRole === 'tenant' ? renderReviewForm() : ''}
            <div id="reviewList"><p style="color:#999;">Loading reviews...</p></div>
        </div>
    `;

    if (p.latitude && p.longitude) {
        const map = L.map('detailMap').setView([p.latitude, p.longitude], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
        L.marker([p.latitude, p.longitude]).addTo(map);

        document.getElementById('directionsBtn').href =
            `https://www.openstreetmap.org/directions?to=${p.latitude}%2C${p.longitude}`;
    }

    if (currentUserRole === 'tenant') attachStarInput();
}

function renderReviewForm() {
    return `
        <div style="margin:12px 0;">
            <p>Your rating:</p>
            <div class="star-input" id="starInput">
                ${[1,2,3,4,5].map(n => `<button type="button" data-star="${n}">★</button>`).join('')}
            </div>
            <textarea id="reviewComment" placeholder="Optional comment about your visit..." style="width:100%;padding:8px;margin-top:8px;border:1px solid #ddd;border-radius:8px;"></textarea>
            <button class="btn btn-primary" style="margin-top:8px;" onclick="submitReview()">Submit Rating</button>
        </div>
    `;
}

function attachStarInput() {
    document.querySelectorAll('#starInput button').forEach(btn => {
        btn.addEventListener('click', function () {
            selectedStars = parseInt(this.dataset.star);
            document.querySelectorAll('#starInput button').forEach(b => {
                b.classList.toggle('active', parseInt(b.dataset.star) <= selectedStars);
            });
        });
    });
}

async function submitReview() {
    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }
    if (selectedStars === 0) {
        alert('Please select a star rating first.');
        return;
    }
    try {
        await db.collection('reviews').add({
            propertyId: propertyId,
            tenantId: currentUser.uid,
            rating: selectedStars,
            comment: document.getElementById('reviewComment').value.trim(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('Thanks — your rating was submitted.');
        loadReviews();
    } catch (error) {
        console.error('Error submitting review:', error);
        alert('Could not submit rating: ' + error.message);
    }
}

async function loadReviews() {
    const list = document.getElementById('reviewList');
    try {
        const snapshot = await db.collection('reviews')
            .where('propertyId', '==', propertyId)
            .get();

        if (snapshot.empty) {
            list.innerHTML = '<p style="color:#999;">No ratings yet.</p>';
            document.getElementById('avgRating').textContent = '';
            return;
        }

        let total = 0;
        let html = '';
        snapshot.forEach(doc => {
            const r = doc.data();
            total += r.rating;
            html += `
                <div class="review-item">
                    <p>${starString(r.rating)}</p>
                    ${r.comment ? `<p>${escapeHtml(r.comment)}</p>` : ''}
                </div>
            `;
        });
        const avg = total / snapshot.size;
        document.getElementById('avgRating').textContent = `— ${starString(avg)} (${avg.toFixed(1)} from ${snapshot.size})`;
        list.innerHTML = html;
    } catch (error) {
        console.error('Error loading reviews:', error);
        list.innerHTML = '<p style="color:#c62828;">Could not load reviews.</p>';
    }
}

async function applyToProperty() {
    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }
    try {
        await db.collection('applications').add({
            propertyId: propertyId,
            tenantId: currentUser.uid,
            ownerId: propertyData.ownerId,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('Application sent! The agent/landlord will be notified.');
    } catch (error) {
        console.error('Error applying:', error);
        alert('Could not send application: ' + error.message);
    }
}

async function reportProperty() {
    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }
    const reason = prompt('What is wrong with this listing? (e.g. address does not match, fake photos, unreachable owner)');
    if (!reason) return;

    try {
        await db.collection('flags').add({
            targetType: 'property',
            targetId: propertyId,
            raisedBy: currentUser.uid,
            reason: reason,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('Thanks — this listing has been flagged for review.');
    } catch (error) {
        console.error('Error flagging property:', error);
        alert('Could not submit report: ' + error.message);
    }
}

window.submitReview = submitReview;
window.applyToProperty = applyToProperty;
window.reportProperty = reportProperty;
