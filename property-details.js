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
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = user;
    const userDoc = await db.collection('users').doc(user.uid).get();
    if (userDoc.exists) currentUserRole = userDoc.data().role;
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
    const messageButton = (currentUser && p.ownerId !== currentUser.uid)
        ? `<a class="btn btn-outline" href="chat.html?with=${p.ownerId}&propertyId=${propertyId}&propertyTitle=${encodeURIComponent(p.title || 'Property')}">💬 Message</a>`
        : '';

    card.innerHTML = `
        <h1>${escapeHtml(p.title || 'Property')}</h1>
        <p class="price">₦${(p.price || 0).toLocaleString()}/year</p>
        <p class="location">📍 ${p.area ? escapeHtml(p.area) + ', ' : ''}${escapeHtml(p.city || '')}</p>
        <p style="color:#667;font-size:14px;margin-bottom:8px;">${escapeHtml(p.address || '')}</p>
        ${getListingBadge(p)}
        <div class="photo-row">${photos || '<p style="color:#999;">No photos uploaded yet.</p>'}</div>
        <p>${escapeHtml(p.description || '')}</p>
        <p style="margin-top:8px;color:#666;">🛏️ ${p.bedrooms || 0} bedroom(s) &middot; ${escapeHtml(p.propertyType || '')}</p>
        <p style="margin-top:6px;">${getUnitsInfo(p)}</p>
        ${(currentUser && p.ownerId === currentUser.uid && (p.unitsTotal || 1) > 1) ? `
            <div style="background:#F7F8FA;border-radius:8px;padding:12px;margin-top:8px;display:flex;align-items:center;gap:12px;">
                <span>Units available:</span>
                <button class="btn btn-outline" onclick="adjustUnits(-1)" style="padding:2px 12px;">−</button>
                <span id="unitsAvailableDisplay" style="font-weight:700;">${(typeof p.unitsAvailable === 'number') ? p.unitsAvailable : (p.unitsTotal || 1)}</span>
                <button class="btn btn-outline" onclick="adjustUnits(1)" style="padding:2px 12px;">+</button>
                <span style="color:#999;font-size:13px;">out of ${p.unitsTotal || 1}</span>
            </div>
        ` : ''}

        <div id="detailMap"></div>
        <div class="action-row">
            <a class="btn btn-outline" id="googleMapsBtn" target="_blank" rel="noopener">🗺️ View on Google Maps</a>
            ${messageButton}
            ${applyButton}
        </div>
        <p><span class="flag-link" onclick="reportProperty()">🚩 Report this listing</span></p>
        <div id="listedBySection" style="margin-top:12px;padding-top:12px;border-top:1px solid #eee;font-size:14px;color:#666;">Loading lister info...</div>

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

        document.getElementById('googleMapsBtn').href =
            `https://www.google.com/maps/search/?api=1&query=${p.latitude}%2C${p.longitude}`;
    }

    if (currentUserRole === 'tenant') { attachStarInput(); loadExistingReview(); }
    loadListedBySection(p);
}

// If this tenant already reviewed this property, prefill the form with
// their existing rating/comment and switch the button to "Update Rating".
async function loadExistingReview() {
    if (!currentUser) return;
    try {
        const doc = await db.collection('reviews').doc(`${propertyId}_${currentUser.uid}`).get();
        if (!doc.exists) return;
        const d = doc.data();
        selectedStars = d.rating;
        document.querySelectorAll('#starInput button').forEach(b => {
            b.classList.toggle('active', parseInt(b.dataset.star) <= selectedStars);
        });
        const commentEl = document.getElementById('reviewComment');
        if (commentEl) commentEl.value = d.comment || '';
        const submitBtn = document.querySelector('#starInput').parentElement.querySelector('button.btn-primary');
        if (submitBtn) submitBtn.textContent = 'Update Rating';
    } catch (e) {
        console.warn('Could not check for existing review:', e);
    }
}

// Shows who posted this listing, with a link to their public profile
// (so a tenant can check the agent/landlord's rating and flags before
// reaching out). For agent-listed properties, also shows the landlord's
// name on file since that's a separate person from the poster.
async function loadListedBySection(p) {
    const el = document.getElementById('listedBySection');
    if (!el) return;
    try {
        const ownerDoc = await db.collection('users').doc(p.ownerId).get();
        const ownerName = ownerDoc.exists ? ownerDoc.data().name : 'this account';
        const ownerRoleLabel = p.ownerRole === 'agent' ? 'Agent' : 'Landlord';

        let html = `Listed by <a href="profile.html?id=${p.ownerId}" style="color:var(--navy);font-weight:600;">${escapeHtml(ownerName)}</a> (${ownerRoleLabel})`;
        if (p.ownerRole === 'agent' && p.landlordName) {
            html += `<br>On behalf of landlord: ${escapeHtml(p.landlordName)}`;
        }
        el.innerHTML = html;
    } catch (e) {
        console.warn('Could not load lister info:', e);
        el.textContent = '';
    }
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
        // Deterministic ID (propertyId_tenantId) means a tenant can only
        // ever have ONE review per property — submitting again updates
        // their existing review instead of creating a duplicate.
        const reviewId = `${propertyId}_${currentUser.uid}`;
        await db.collection('reviews').doc(reviewId).set({
            propertyId: propertyId,
            tenantId: currentUser.uid,
            rating: selectedStars,
            comment: document.getElementById('reviewComment').value.trim(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('Thanks — your rating was saved.');
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

// Lets the owner update how many units are currently available without
// going through the full edit form (which resets the "Not yet verified"
// badge) — this is just a quick occupancy count change, nothing about
// the listing itself changed.
async function adjustUnits(delta) {
    if (!propertyData || !currentUser || propertyData.ownerId !== currentUser.uid) return;
    const total = propertyData.unitsTotal || 1;
    const current = (typeof propertyData.unitsAvailable === 'number') ? propertyData.unitsAvailable : total;
    const next = Math.max(0, Math.min(total, current + delta));
    if (next === current) return;

    try {
        await db.collection('properties').doc(propertyId).update({ unitsAvailable: next });
        propertyData.unitsAvailable = next;
        document.getElementById('unitsAvailableDisplay').textContent = next;
    } catch (error) {
        console.error('Error updating units available:', error);
        alert('Could not update: ' + error.message);
    }
}
window.adjustUnits = adjustUnits;

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

        await createNotification(propertyData.ownerId, 'application', `New application for "${propertyData.title}"`, `chat.html?with=${currentUser.uid}`);

        // Straight into a live conversation with the owner — this is the
        // actual "contact" part, not just a silent application record.
        window.location.href = `chat.html?with=${propertyData.ownerId}&propertyId=${propertyId}&propertyTitle=${encodeURIComponent(propertyData.title || 'Property')}`;
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

    const choice = prompt(
        'What kind of issue is this? Type the number:\n' +
        '1 = Listing does not match the address/description\n' +
        '2 = Agent/Landlord asked to deal outside the app\n' +
        '3 = Fake photos or documents\n' +
        '4 = Unreachable owner/agent\n' +
        '5 = Other'
    );
    if (!choice) return;

    const typeMap = {
        '1': 'listing-mismatch',
        '2': 'off-platform-dealing',
        '3': 'fake-documents',
        '4': 'unreachable',
        '5': 'other'
    };
    const violationType = typeMap[choice.trim()] || 'other';

    const reason = prompt('Add a few details about what happened:');
    if (!reason) return;

    try {
        await db.collection('flags').add({
            targetType: 'property',
            targetId: propertyId,
            violationType: violationType,   // used by admin to prioritize + track repeat offenders
            raisedBy: currentUser.uid,
            reason: reason,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('Thanks — this listing has been flagged for review.' +
              (violationType === 'off-platform-dealing'
                ? ' Reports of dealing outside the app are treated seriously and can lead to account suspension.'
                : ''));
    } catch (error) {
        console.error('Error flagging property:', error);
        alert('Could not submit report: ' + error.message);
    }
}

window.submitReview = submitReview;
window.applyToProperty = applyToProperty;
window.reportProperty = reportProperty;
