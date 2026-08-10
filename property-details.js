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
        <div class="price-breakdown" style="background:#F7F8FA;border-radius:8px;padding:14px;margin:8px 0;" id="priceBreakdown">
            ${(() => {
                const b = getPriceBreakdown(p);
                return `
                    <div style="display:flex;justify-content:space-between;padding:4px 0;">
                        <span>House Rent</span><strong>₦${b.rent.toLocaleString()}/year</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:4px 0;color:#666;font-size:14px;">
                        <span>Service/Repair Fee (${b.serviceFeePercent}%)</span><span>₦${b.serviceFee.toLocaleString()}</span>
                    </div>
                    ${b.isAgentListing ? `
                    <div style="display:flex;justify-content:space-between;padding:4px 0;color:#666;font-size:14px;">
                        <span>Agent Commission (${b.commissionPercent}%)</span><span>₦${b.commissionFee.toLocaleString()}</span>
                    </div>` : ''}
                    <div style="display:flex;justify-content:space-between;padding:8px 0 0;margin-top:4px;border-top:1px solid #ddd;font-weight:700;">
                        <span>Total (first year)</span><span>₦${b.total.toLocaleString()}</span>
                    </div>
                    <p id="repairDiscountNote" style="font-size:12px;color:#2e7d32;margin-top:6px;"></p>
                `;
            })()}
        </div>
        <p class="location">📍 ${p.area ? escapeHtml(p.area) + ', ' : ''}${escapeHtml(p.city || '')}</p>
        <p style="color:#667;font-size:14px;margin-bottom:8px;">${escapeHtml(p.address || '')}</p>
        ${(currentUser && currentUserRole === 'tenant') ? `<p><span class="flag-link" style="color:#0F2C59;" onclick="requestRepair()">🔧 Request a Repair</span></p>` : ''}
        ${getListingBadge(p)}
        <div class="photo-row">${photos || '<p style="color:#999;">No photos uploaded yet.</p>'}</div>
        <p>${escapeHtml(p.description || '')}</p>
        <p style="margin-top:8px;color:#666;">🛏️ ${p.bedrooms || 0} room(s)/space &middot; ${escapeHtml(p.propertyType || '')}</p>
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
        ${(currentUser && p.ownerId === currentUser.uid) ? `
            <div id="renewalSection" style="margin-top:14px;"></div>
            ${(p.ownerRole === 'landlord') ? `<div id="caretakerAgreementSection" style="margin-top:14px;"></div>` : ''}
            <div id="applicantsSection" style="margin-top:14px;"></div>
        ` : ''}
        ${(currentUserRole === 'agent' && p.ownerRole === 'landlord' && !p.caretakerRoleActive && (!currentUser || p.ownerId !== currentUser.uid)) ? `
            <div style="background:#fff8e1;border-radius:8px;padding:10px 14px;margin-top:10px;font-size:13px;color:#8a6d00;">
                🤝 This landlord doesn't have a caretaker yet — message them if you're interested in managing it.
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

    if (currentUserRole === 'tenant') { attachStarInput(); loadExistingReview(); checkRepairDiscount(); }
    loadListedBySection(p);
    if (currentUser && p.ownerId === currentUser.uid) {
        loadApplicants(p);
        loadRenewalSection(p);
        if (p.ownerRole === 'landlord') loadCaretakerAgreementSection(p);
    }
}

// Lets a tenant log a repair request. Also affects their OWN Service/
// Repair Fee next renewal — 0-1 requests in the lease year keeps it at
// 5%, more than that keeps it at the normal 10%. This is personal to
// each tenant, not shown on the general listing.
async function requestRepair() {
    if (!currentUser) { window.location.href = 'login.html'; return; }
    const description = prompt('Briefly describe the repair issue:');
    if (!description) return;

    try {
        await db.collection('repairRequests').add({
            propertyId: propertyId,
            tenantId: currentUser.uid,
            ownerId: propertyData.ownerId,
            description: description,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await createNotification(propertyData.ownerId, 'repair', `Repair request for "${propertyData.title}"`, `property-details.html?id=${propertyId}`);
        alert('Repair request sent to the landlord/agent.');
        checkRepairDiscount();
    } catch (error) {
        console.error('Error submitting repair request:', error);
        alert('Could not send request: ' + error.message);
    }
}
window.requestRepair = requestRepair;

// Shows the tenant their own upcoming Service/Repair Fee rate based on
// how many repair requests they've logged in the current lease year.
async function checkRepairDiscount() {
    if (!currentUser) return;
    const note = document.getElementById('repairDiscountNote');
    if (!note) return;
    try {
        const snapshot = await db.collection('repairRequests')
            .where('propertyId', '==', propertyId)
            .where('tenantId', '==', currentUser.uid)
            .get();
        const count = snapshot.size;
        note.textContent = count <= 1
            ? `✅ You've logged ${count} repair request${count === 1 ? '' : 's'} — your Service/Repair Fee stays at 5% next renewal.`
            : `You've logged ${count} repair requests — Service/Repair Fee will be the standard 10% next renewal.`;
    } catch (e) {
        console.warn('Could not check repair discount:', e);
    }
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

// Shows everyone who applied to this property, with a "Confirm Payment
// & Move In" action for the owner. This is the actual trigger for
// automatic availability adjustment — not the manual +/- stepper, which
// is just there for corrections.
async function loadApplicants(p) {
    const section = document.getElementById('applicantsSection');
    if (!section) return;
    try {
        const snapshot = await db.collection('applications')
            .where('propertyId', '==', propertyId)
            .get();

        if (snapshot.empty) {
            section.innerHTML = `<p style="color:#999;font-size:14px;">No applicants yet.</p>`;
            return;
        }

        const available = (typeof p.unitsAvailable === 'number') ? p.unitsAvailable : (p.unitsTotal || 1);

        const rows = await Promise.all(snapshot.docs.map(async doc => {
            const a = doc.data();
            let tenantName = 'Tenant';
            try {
                const tDoc = await db.collection('users').doc(a.tenantId).get();
                if (tDoc.exists) tenantName = tDoc.data().name;
            } catch (e) {}

            if (a.status === 'occupied') {
                return `<div class="review-item">✅ <a href="profile.html?id=${a.tenantId}">${escapeHtml(tenantName)}</a> — moved in</div>`;
            }
            return `
                <div class="review-item" style="display:flex;justify-content:space-between;align-items:center;">
                    <a href="profile.html?id=${a.tenantId}">${escapeHtml(tenantName)}</a>
                    ${available > 0
                        ? `<button class="btn btn-primary" style="padding:4px 10px;font-size:13px;" onclick="markOccupied('${doc.id}','${a.tenantId}','${escapeHtml(tenantName)}')">Confirm Payment &amp; Move In</button>`
                        : `<span style="color:#999;font-size:12px;">No units left</span>`}
                </div>
            `;
        }));

        section.innerHTML = `<h3 style="font-size:16px;font-family:'Fraunces',serif;">Applicants</h3>${rows.join('')}`;
    } catch (error) {
        console.error('Error loading applicants:', error);
        section.innerHTML = `<p style="color:#c62828;font-size:14px;">Could not load applicants.</p>`;
    }
}

// Confirms a tenant has paid and moved in (confirmed manually — outside
// the app, e.g. bank transfer — same trust model as everything else
// here). Creates a tenancy record for the lease countdown, marks their
// application occupied, and automatically decrements unitsAvailable.
async function markOccupied(applicationId, tenantId, tenantName) {
    const months = prompt(`Confirm: has ${tenantName} paid and is moving in?\n\nEnter lease length in months (e.g. 12 for a year, 6 for half a year):`, '12');
    if (!months) return;
    const leaseMonths = parseInt(months);
    if (!leaseMonths || leaseMonths <= 0) {
        alert('Please enter a valid number of months.');
        return;
    }

    try {
        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + leaseMonths);

        await db.collection('tenancies').add({
            propertyId: propertyId,
            propertyTitle: propertyData.title,
            tenantId: tenantId,
            ownerId: currentUser.uid,
            leaseMonths: leaseMonths,
            startDate: firebase.firestore.Timestamp.fromDate(startDate),
            endDate: firebase.firestore.Timestamp.fromDate(endDate),
            status: 'active',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await db.collection('applications').doc(applicationId).update({ status: 'occupied' });

        await db.collection('properties').doc(propertyId).update({
            unitsAvailable: firebase.firestore.FieldValue.increment(-1)
        });

        await createNotification(tenantId, 'tenancy', `You're confirmed as moved in at "${propertyData.title}" — lease runs ${leaseMonths} months.`, `dashboard.html`);

        alert('Confirmed! Availability updated automatically.');
        window.location.reload();
    } catch (error) {
        console.error('Error confirming occupancy:', error);
        alert('Could not confirm: ' + error.message);
    }
}
window.markOccupied = markOccupied;

// Shows the "Record Rent Renewal" action for the owner, plus any
// caretaker debts still owed on THIS property so far — settled
// automatically (in calculation, not real money yet) the moment a
// renewal payment is recorded.
async function loadRenewalSection(p) {
    const section = document.getElementById('renewalSection');
    if (!section) return;
    try {
        const snapshot = await db.collection('caretakerDebts')
            .where('propertyId', '==', propertyId)
            .get();

        let debtsHtml = '';
        if (!snapshot.empty) {
            debtsHtml = snapshot.docs.map(doc => {
                const d = doc.data();
                const label = d.status === 'paid' ? '✅ Paid'
                    : d.status === 'due' ? `⏳ Due — ₦${(d.owedAmount || 0).toLocaleString()}`
                    : `📋 Recorded, awaiting next rent payment (est. ₦${(d.owedAmount || 0).toLocaleString()})`;
                return `<div style="font-size:13px;color:#666;padding:4px 0;">${d.monthsWorked} months at ${d.commissionPercent}% (${escapeHtml(d.formerAgentName || 'former agent')}) — ${label}</div>`;
            }).join('');
        }

        section.innerHTML = `
            <div style="background:#F7F8FA;border-radius:8px;padding:14px;">
                <p style="font-weight:600;margin-bottom:6px;">💵 Rent Renewal</p>
                ${debtsHtml ? `<div style="margin-bottom:10px;">${debtsHtml}</div>` : ''}
                <button class="btn btn-primary" style="padding:6px 14px;font-size:14px;" onclick="recordRentRenewal()">Record Rent Renewal Payment</button>
                <div style="font-size:12px;color:#666;margin-top:6px;">Recording a renewal automatically calculates what's owed to any former caretakers, using the new rent — matches how it works in real life: the payout happens when the next real payment comes in.</div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading renewal section:', error);
    }
}

// The core fix: former caretakers get paid based on the rent that's
// ACTUALLY paid at renewal, not the rent from whenever they left. If
// multiple agents managed this property across different periods, each
// one's share is calculated independently against this same payment.
async function recordRentRenewal() {
    const newRentStr = prompt('Enter the new rent amount just paid (₦):', propertyData.price || '');
    if (!newRentStr) return;
    const newRent = parseFloat(newRentStr);
    if (!newRent || newRent <= 0) { alert('Please enter a valid amount.'); return; }

    try {
        const snapshot = await db.collection('caretakerDebts')
            .where('propertyId', '==', propertyId)
            .where('status', '==', 'outstanding')
            .get();

        for (const doc of snapshot.docs) {
            const d = doc.data();
            const owedAmount = Math.round((d.monthsWorked / 12) * (d.commissionPercent / 100) * newRent);
            await db.collection('caretakerDebts').doc(doc.id).update({
                status: 'due',
                owedAmount: owedAmount,
                rentUsedForCalc: newRent,
                calculatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            await createNotification(d.formerAgentId, 'caretaker-debt',
                `Your caretaker wage for "${propertyData.title}" is now due: ₦${owedAmount.toLocaleString()} (${d.monthsWorked} months at ${d.commissionPercent}%)`,
                'dashboard.html');
        }

        if (propertyData.caretakerRoleActive && propertyData.caretakerAgentId) {
            await createNotification(propertyData.caretakerAgentId, 'caretaker-debt',
                `Rent renewed for "${propertyData.title}" — your ${propertyData.caretakerCommissionPercent || 10}% caretaker share from this payment: ₦${Math.round(newRent * ((propertyData.caretakerCommissionPercent || 10) / 100)).toLocaleString()}`,
                'dashboard.html');
        }

        await db.collection('properties').doc(propertyId).update({ price: newRent });
        propertyData.price = newRent;

        alert(snapshot.empty
            ? 'Renewal recorded. Rent updated.'
            : `Renewal recorded. ${snapshot.size} former caretaker(s) notified of what's now due.`);
        loadRenewalSection(propertyData);
    } catch (error) {
        console.error('Error recording renewal:', error);
        alert('Could not record renewal: ' + error.message);
    }
}
window.recordRentRenewal = recordRentRenewal;

// =====================================================================
// CARETAKER AGREEMENTS — landlord prepares and sends a contract to a
// specific agent; the agent accepts (signs), declines, or asks to
// renegotiate via chat. On acceptance, the property gets an assigned
// caretaker without changing who owns the listing.
// =====================================================================
const CARETAKER_CONTRACT_TEMPLATE = (propertyTitle, commissionPercent) => `CARETAKER MANAGEMENT AGREEMENT

Property: ${propertyTitle}
Commission: ${commissionPercent}% of house rent per payment cycle

The Agent agrees to:
1. Manage tenant relations, inquiries, and viewings for this property on the Landlord's behalf.
2. Report any maintenance/repair issues to the Landlord promptly.
3. Represent the property honestly and in accordance with VerifyStay's platform rules.
4. Not deal with tenants outside the VerifyStay platform.

The Landlord agrees to:
1. Pay the Agent ${commissionPercent}% of each rent payment collected during the Agent's tenure as caretaker.
2. If the Agent is removed before a renewal, pay a pro-rated share for the months served, calculated as (months served ÷ 12) × ${commissionPercent}% × the next rent payment.
3. Provide reasonable notice before ending this agreement where possible.

Both parties agree this record, once signed by both, serves as their agreement for the caretaking arrangement described above.`;

async function loadCaretakerAgreementSection(p) {
    const section = document.getElementById('caretakerAgreementSection');
    if (!section) return;

    if (p.caretakerRoleActive && p.caretakerAgentId) {
        let agentName = 'the assigned agent';
        try {
            const doc = await db.collection('users').doc(p.caretakerAgentId).get();
            if (doc.exists) agentName = doc.data().name;
        } catch (e) {}
        section.innerHTML = `
            <div style="background:#e8f5e9;border-radius:8px;padding:14px;">
                <p style="font-weight:600;">🤝 Caretaker: <a href="profile.html?id=${p.caretakerAgentId}">${escapeHtml(agentName)}</a></p>
                <p style="font-size:13px;color:#666;">Commission: ${p.caretakerCommissionPercent}% — managing since ${p.caretakerStartDate ? p.caretakerStartDate.toDate().toLocaleDateString() : ''}</p>
            </div>
        `;
        return;
    }

    // Check for a pending contract already sent
    let pendingContract = null;
    try {
        const snapshot = await db.collection('contracts')
            .where('propertyId', '==', propertyId)
            .where('status', '==', 'pending')
            .get();
        if (!snapshot.empty) pendingContract = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    } catch (e) { console.warn(e); }

    if (pendingContract) {
        section.innerHTML = `
            <div style="background:#fff3e0;border-radius:8px;padding:14px;">
                <p style="font-weight:600;">📝 Agreement sent, awaiting response</p>
                <p style="font-size:13px;color:#666;">Sent to ${escapeHtml(pendingContract.toUserName || 'agent')} — ${pendingContract.commissionPercent}% commission</p>
                <a href="contract.html?id=${pendingContract.id}" style="font-size:13px;">View agreement →</a>
            </div>
        `;
        return;
    }

    section.innerHTML = `
        <div style="background:#F7F8FA;border-radius:8px;padding:14px;">
            <p style="font-weight:600;margin-bottom:6px;">📝 No caretaker assigned</p>
            <button class="btn btn-primary" style="padding:6px 14px;font-size:14px;" onclick="startPrepareAgreement()">Prepare Caretaker Agreement</button>
            <div id="prepareAgreementForm" style="display:none;margin-top:12px;"></div>
        </div>
    `;
}

function startPrepareAgreement() {
    const form = document.getElementById('prepareAgreementForm');
    form.style.display = 'block';
    form.innerHTML = `
        <div class="form-group">
            <label>Agent's email (they must have a VerifyStay agent account)</label>
            <input type="email" id="contractAgentEmail" placeholder="agent@email.com">
        </div>
        <div class="form-group">
            <label>Commission (%)</label>
            <input type="number" id="contractCommission" value="10" min="1" max="100">
        </div>
        <div class="form-group">
            <label>Agreement Terms</label>
            <textarea id="contractTerms" rows="10" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-family:monospace;font-size:12px;">${CARETAKER_CONTRACT_TEMPLATE(propertyData.title, 10)}</textarea>
            <div class="help-text">Pre-filled template — edit any part of it before sending.</div>
        </div>
        <div class="form-group">
            <label>Your Signature</label>
            <input type="text" id="contractFromSignature" placeholder="Type your full legal name">
        </div>
        <button class="btn btn-primary" onclick="sendCaretakerAgreement()">Send Agreement</button>
    `;

    db.collection('users').doc(currentUser.uid).get().then(doc => {
        if (doc.exists && doc.data().signatureName) {
            document.getElementById('contractFromSignature').value = doc.data().signatureName;
        }
    });
    document.getElementById('contractCommission').addEventListener('input', function () {
        document.getElementById('contractTerms').value = CARETAKER_CONTRACT_TEMPLATE(propertyData.title, this.value || 0);
    });
}
window.startPrepareAgreement = startPrepareAgreement;

async function sendCaretakerAgreement() {
    const email = document.getElementById('contractAgentEmail').value.trim().toLowerCase();
    const commissionPercent = parseFloat(document.getElementById('contractCommission').value) || 10;
    const terms = document.getElementById('contractTerms').value.trim();
    const fromSignature = document.getElementById('contractFromSignature').value.trim();

    if (!email || !terms || !fromSignature) {
        alert('Please fill in the agent\'s email, terms, and your signature.');
        return;
    }

    try {
        const userSnapshot = await db.collection('users').where('email', '==', email).where('role', '==', 'agent').get();
        if (userSnapshot.empty) {
            alert('No agent account found with that email. Double-check the address, or ask them to confirm they signed up as an Agent.');
            return;
        }
        const agentDoc = userSnapshot.docs[0];
        const agentId = agentDoc.id;
        const agentName = agentDoc.data().name;

        const contractRef = await db.collection('contracts').add({
            type: 'caretaker',
            propertyId: propertyId,
            propertyTitle: propertyData.title,
            fromUserId: currentUser.uid,
            fromRole: 'landlord',
            toUserId: agentId,
            toUserName: agentName,
            commissionPercent: commissionPercent,
            terms: terms,
            status: 'pending',
            fromSignature: fromSignature,
            fromSignedAt: firebase.firestore.FieldValue.serverTimestamp(),
            toSignature: null,
            toSignedAt: null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await createNotification(agentId, 'contract', `${propertyData.title}: Caretaker agreement sent for your review`, `contract.html?id=${contractRef.id}`);

        alert('Agreement sent! You\'ll be notified once they respond.');
        loadCaretakerAgreementSection(propertyData);
    } catch (error) {
        console.error('Error sending agreement:', error);
        alert('Could not send agreement: ' + error.message);
    }
}
window.sendCaretakerAgreement = sendCaretakerAgreement;

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
