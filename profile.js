// =====================
// VERIFYSTAY - Profile Logic
// Supports two modes:
//  - profile.html            -> your own editable profile
//  - profile.html?id=<uid>   -> read-only public view of someone else
//    (tenant checking an agent/landlord's credentials, or an agent/
//    landlord checking a tenant's reputation before renting to them)
// =====================

let currentUser = null;
let currentUserRole = null;
let viewedUid = null;
let isOwnProfile = true;
let selectedTenantStars = 0;

auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = user;

    const myDoc = await db.collection('users').doc(user.uid).get();
    currentUserRole = myDoc.exists ? myDoc.data().role : null;

    const params = new URLSearchParams(window.location.search);
    viewedUid = params.get('id') || user.uid;
    isOwnProfile = viewedUid === user.uid;

    // This is one of the two places the automatic ban check runs from —
    // viewing someone's profile is exactly when it matters most to know
    // if they're currently suspended.
    await checkAndApplyBan(viewedUid);

    if (isOwnProfile) {
        await renderOwnProfile();
    } else {
        await renderPublicProfile();
    }
});

// =====================================================================
// OWN PROFILE (editable)
// =====================================================================
async function renderOwnProfile() {
    const card = document.getElementById('profileCard');
    try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        if (!doc.exists) { card.innerHTML = '<p>Profile not found.</p>'; return; }
        const data = doc.data();
        const role = data.role || '';

        const suspended = data.suspendedUntil && data.suspendedUntil.toDate() > new Date();

        card.innerHTML = `
            <div class="profile-avatar-wrap">
                <label for="pfpInput" style="cursor:pointer;">
                    <div class="profile-avatar" id="avatarDisplay">
                        ${data.profilePictureUrl ? `<img src="${data.profilePictureUrl}" alt="">` : '👤'}
                    </div>
                </label>
                <input type="file" id="pfpInput" accept="image/*" style="display:none;">
                <div><small style="color:#666;">Tap photo to change</small></div>
            </div>

            <h2 style="text-align:center;">${escapeHtml(data.name || 'My Profile')}</h2>
            <p style="text-align:center; text-transform:capitalize; color:#666; margin-top:-8px;">${escapeHtml(role)}</p>

            ${suspended ? `<div style="background:#fdecea;color:#c62828;padding:10px;border-radius:8px;text-align:center;margin-bottom:12px;">⚠️ Suspended until ${data.suspendedUntil.toDate().toLocaleDateString()}</div>` : ''}

            <div class="stats-grid" id="statsGrid">
                <div class="stat-box"><div class="num">…</div><div class="label">${role === 'tenant' ? 'Applications' : 'Listings'}</div></div>
                <div class="stat-box"><div class="num">${starString(data.rating || 0)}</div><div class="label">${(data.rating || 0).toFixed(1)} rating</div></div>
                <div class="stat-box"><div class="num" id="redFlagCount">…</div><div class="label">Red flags</div></div>
            </div>

            <div class="profile-row"><span>Email</span><strong>${escapeHtml(data.email || '')}</strong></div>
            <div class="profile-row"><span>Phone verified</span><strong>${data.phoneVerified ? '✅ Yes' : '❌ Not yet'}</strong></div>
            <div class="profile-row"><span>Document verified</span><strong>${data.verified ? '✅ Yes' : 'Not yet'}</strong></div>
            ${role === 'agent' ? `<div class="profile-row"><span>Agent Level</span><strong>Level ${data.agentLevel || 1}</strong></div>` : ''}
            ${role === 'landlord' ? `<div class="profile-row"><span>Landlord Tier</span><strong style="text-transform:capitalize;">${escapeHtml((data.landlordTier || 'new').replace('-', ' '))}</strong></div>` : ''}
            <div class="profile-row"><span>Admin flags (private — only you see this)</span><strong>${data.strikeCount || 0} / 3</strong></div>
            <div class="profile-row"><span>Times suspended</span><strong>${data.banCount || 0}</strong></div>

            <div class="form-group">
                <label>Full Name</label>
                <input type="text" id="editName" value="${escapeHtml(data.name || '')}">
            </div>
            <div class="form-group">
                <label>Gender</label>
                <select id="editGender" style="width:100%; padding:12px; border:1px solid #ddd; border-radius:8px; font-size:16px;">
                    <option value="" ${!data.gender ? 'selected' : ''}>Prefer not to say</option>
                    <option value="male" ${data.gender === 'male' ? 'selected' : ''}>Male</option>
                    <option value="female" ${data.gender === 'female' ? 'selected' : ''}>Female</option>
                </select>
            </div>
            <div class="form-group">
                <label>Phone</label>
                <input type="text" id="editPhone" value="${escapeHtml(data.phone || '')}" disabled>
                <small style="color:#666;">Confirmed manually by phone call during account review — contact support to change it.</small>
            </div>
            <div class="form-group">
                <label>E-Signature</label>
                <input type="text" id="editSignature" value="${escapeHtml(data.signatureName || '')}" placeholder="Type your full legal name">
                <small style="color:#666;">Used to sign agreements in the app (caretaker contracts, tenancy agreements). Typing your name here counts as your signature when you accept an agreement.</small>
            </div>

            <div class="form-group" style="background:#F7F8FA;border-radius:8px;padding:14px;">
                <p style="font-weight:600;margin-bottom:4px;">🏦 Payment Details</p>
                <p style="font-size:13px;color:#666;margin-bottom:10px;">${role === 'tenant'
                    ? 'Used to refund you if you\'re ever owed money back — never shown to anyone else.'
                    : 'Where rent/commission payments will be sent once in-app payment collection is live. Never shown publicly — only you see this.'}</p>
                <label>Bank Name</label>
                <input type="text" id="editBankName" value="${escapeHtml(data.bankName || '')}" placeholder="e.g., GTBank" style="margin-bottom:10px;">
                <label>Account Number</label>
                <input type="text" id="editAccountNumber" value="${escapeHtml(data.accountNumber || '')}" placeholder="0123456789" style="margin-bottom:10px;">
                <label>Account Name</label>
                <input type="text" id="editAccountName" value="${escapeHtml(data.accountName || '')}" placeholder="Name on the account">
            </div>

            <button class="btn btn-primary" style="margin-top:16px;" onclick="saveProfile()">Save Changes</button>
            <div id="successMessage" class="success-message">✅ Profile updated.</div>

            <div style="margin-top:28px;">
                <h3 style="font-family:'Fraunces',serif;">${role === 'tenant' ? 'My Applications' : 'Reviews & Feedback'}</h3>
                <div id="feedbackList"><p style="color:#999;">Loading...</p></div>
            </div>
        `;

        document.getElementById('pfpInput').addEventListener('change', handlePfpChange);

        loadStatsAndFeedback(role, currentUser.uid, true);
        getRedFlagSummary(currentUser.uid).then(r => {
            document.getElementById('redFlagCount').textContent = r.count;
        });
    } catch (error) {
        console.error('Error loading profile:', error);
        card.innerHTML = '<p style="color:#c62828;">Error loading profile.</p>';
    }
}

async function handlePfpChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const display = document.getElementById('avatarDisplay');
    const reader = new FileReader();
    reader.onload = (ev) => { display.innerHTML = `<img src="${ev.target.result}" alt="">`; };
    reader.readAsDataURL(file);

    try {
        const url = await uploadFile(file, `profile-pictures/${currentUser.uid}`);
        await db.collection('users').doc(currentUser.uid).update({ profilePictureUrl: url });
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        alert('Could not upload photo: ' + error.message);
    }
}

async function saveProfile() {
    const name = document.getElementById('editName').value.trim();
    const gender = document.getElementById('editGender').value;
    const signatureName = document.getElementById('editSignature').value.trim();
    const bankName = document.getElementById('editBankName').value.trim();
    const accountNumber = document.getElementById('editAccountNumber').value.trim();
    const accountName = document.getElementById('editAccountName').value.trim();
    if (!name) { alert('Name cannot be empty.'); return; }
    try {
        await db.collection('users').doc(currentUser.uid).update({
            name: name,
            gender: gender,
            signatureName: signatureName,
            bankName: bankName,
            accountNumber: accountNumber,
            accountName: accountName
        });
        document.getElementById('successMessage').style.display = 'block';
    } catch (error) {
        console.error('Error saving profile:', error);
        alert('Could not save: ' + error.message);
    }
}
window.saveProfile = saveProfile;

// =====================================================================
// PUBLIC PROFILE (read-only, someone else's account)
// =====================================================================
async function renderPublicProfile() {
    const card = document.getElementById('profileCard');
    try {
        const doc = await db.collection('users').doc(viewedUid).get();
        if (!doc.exists) { card.innerHTML = '<p>This profile could not be found.</p>'; return; }
        const data = doc.data();
        const role = data.role || '';
        const suspended = data.suspendedUntil && data.suspendedUntil.toDate() > new Date();

        // Landlords/agents can rate a tenant; nobody rates landlords/agents
        // here directly — their rating comes from property reviews instead.
        const showRateTenant = (currentUserRole === 'landlord' || currentUserRole === 'agent') && role === 'tenant';

        card.innerHTML = `
            <div class="profile-avatar-wrap">
                <div class="profile-avatar" ${data.profilePictureUrl ? `onclick="openImageLightbox('${data.profilePictureUrl}')" style="cursor:zoom-in;"` : ''}>
                    ${data.profilePictureUrl ? `<img src="${data.profilePictureUrl}" alt="">` : '👤'}
                </div>
            </div>

            <h2 style="text-align:center;">${escapeHtml(data.name || 'VerifyStay User')}</h2>
            <p style="text-align:center; text-transform:capitalize; color:#666; margin-top:-8px;">${escapeHtml(role)}</p>

            ${suspended ? `<div style="background:#fdecea;color:#c62828;padding:10px;border-radius:8px;text-align:center;margin-bottom:12px;">⚠️ This account is currently suspended</div>` : ''}
            ${data.verified ? `<div style="text-align:center;margin-bottom:8px;"><span class="badge badge-verified">✅ Document Verified</span></div>` : ''}

            <div class="stats-grid" id="statsGrid">
                <div class="stat-box"><div class="num" id="pubCountNum">…</div><div class="label">${role === 'tenant' ? 'Rentals' : 'Listings'}</div></div>
                <div class="stat-box"><div class="num" id="pubRatingStars">…</div><div class="label" id="pubRatingLabel">rating</div></div>
                <div class="stat-box"><div class="num" id="pubRedFlagCount">…</div><div class="label">Red flags</div></div>
            </div>

            <p style="text-align:center;">
                <span class="flag-link" onclick="reportUser()">🚩 Report this user</span>
            </p>

            ${showRateTenant ? `
                <div style="background:#F7F8FA;border-radius:8px;padding:14px;margin:16px 0;">
                    <p style="font-weight:600;margin-bottom:8px;">⭐ Rate this tenant</p>
                    <div id="tenantStarInput" style="font-size:26px;cursor:pointer;margin-bottom:8px;">☆☆☆☆☆</div>
                    <textarea id="tenantReviewComment" placeholder="Optional comment about renting to this tenant" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;"></textarea>
                    <button class="btn btn-primary" style="margin-top:8px;" onclick="submitTenantReview()">Submit Rating</button>
                </div>
            ` : ''}

            <div style="margin-top:24px;">
                <h3 style="font-family:'Fraunces',serif;">${role === 'tenant' ? 'Feedback from Landlords/Agents' : 'Reviews from Tenants'}</h3>
                <div id="feedbackList"><p style="color:#999;">Loading...</p></div>
            </div>
        `;

        loadStatsAndFeedback(role, viewedUid, false);
        getRedFlagSummary(viewedUid).then(r => {
            document.getElementById('pubRedFlagCount').textContent = r.count;
        });
        if (showRateTenant) attachTenantStarInput();
    } catch (error) {
        console.error('Error loading public profile:', error);
        card.innerHTML = '<p style="color:#c62828;">Error loading this profile.</p>';
    }
}

function attachTenantStarInput() {
    const wrap = document.getElementById('tenantStarInput');
    wrap.addEventListener('click', function (e) {
        const rect = wrap.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const starWidth = rect.width / 5;
        selectedTenantStars = Math.min(5, Math.max(1, Math.ceil(clickX / starWidth)));
        wrap.textContent = '★'.repeat(selectedTenantStars) + '☆'.repeat(5 - selectedTenantStars);
    });
}

async function submitTenantReview() {
    if (selectedTenantStars === 0) { alert('Please select a star rating first.'); return; }
    try {
        // Deterministic ID means each landlord/agent can only leave ONE
        // rating per tenant — submitting again updates it, no duplicates.
        const reviewId = `${viewedUid}_${currentUser.uid}`;
        await db.collection('tenantReviews').doc(reviewId).set({
            tenantId: viewedUid,
            raisedBy: currentUser.uid,
            rating: selectedTenantStars,
            comment: document.getElementById('tenantReviewComment').value.trim(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('Thanks — your rating was saved.');
        loadStatsAndFeedback('tenant', viewedUid, false);
    } catch (error) {
        console.error('Error submitting tenant review:', error);
        alert('Could not submit rating: ' + error.message);
    }
}
window.submitTenantReview = submitTenantReview;

// Report a person (not a specific listing) — same category pattern as
// reporting a property, saved with targetType 'user' so it counts toward
// their public red-flag total.
async function reportUser() {
    const choice = prompt(
        'What kind of issue is this? Type the number:\n' +
        '1 = Asked to deal outside the app\n' +
        '2 = Unreachable / unresponsive\n' +
        '3 = Misrepresented themselves or a property\n' +
        '4 = Rude or unprofessional conduct\n' +
        '5 = Other'
    );
    if (!choice) return;
    const typeMap = { '1': 'off-platform-dealing', '2': 'unreachable', '3': 'misrepresentation', '4': 'conduct', '5': 'other' };
    const violationType = typeMap[choice.trim()] || 'other';
    const reason = prompt('Add a few details about what happened:');
    if (!reason) return;

    try {
        await db.collection('flags').add({
            targetType: 'user',
            targetId: viewedUid,
            violationType: violationType,
            raisedBy: currentUser.uid,
            reason: reason,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('Thanks — this has been reported for review.');
        getRedFlagSummary(viewedUid).then(r => {
            const el = document.getElementById('pubRedFlagCount');
            if (el) el.textContent = r.count;
        });
    } catch (error) {
        console.error('Error reporting user:', error);
        alert('Could not submit report: ' + error.message);
    }
}
window.reportUser = reportUser;

// =====================================================================
// SHARED: stats + feedback list (works for both own and public views)
// =====================================================================
async function loadStatsAndFeedback(role, uid, isOwn) {
    const feedbackList = document.getElementById('feedbackList');
    const statNum = isOwn ? document.querySelector('#statsGrid .stat-box .num') : document.getElementById('pubCountNum');

    try {
        if (role === 'tenant') {
            // Rentals/reputation count = number of tenant reviews received
            const reviewSnapshot = await db.collection('tenantReviews')
                .where('tenantId', '==', uid)
                .get();

            if (isOwn) {
                // Own view shows application count in the first stat box instead
                const appSnapshot = await db.collection('applications').where('tenantId', '==', uid).get();
                if (statNum) statNum.textContent = appSnapshot.size;
            } else if (statNum) {
                statNum.textContent = reviewSnapshot.size;
            }

            if (!isOwn) {
                let total = 0;
                reviewSnapshot.forEach(d => total += d.data().rating);
                const avg = reviewSnapshot.size ? total / reviewSnapshot.size : 0;
                const starsEl = document.getElementById('pubRatingStars');
                const labelEl = document.getElementById('pubRatingLabel');
                if (starsEl) starsEl.textContent = starString(avg);
                if (labelEl) labelEl.textContent = `${avg.toFixed(1)} from ${reviewSnapshot.size}`;
            }

            if (isOwn) {
                const appSnapshot = await db.collection('applications').where('tenantId', '==', uid).get();
                if (appSnapshot.empty) {
                    feedbackList.innerHTML = '<p style="color:#999;">No applications yet.</p>';
                    return;
                }
                let html = '';
                for (const d of appSnapshot.docs) {
                    const data = d.data();
                    let title = 'Property';
                    try {
                        const p = await db.collection('properties').doc(data.propertyId).get();
                        if (p.exists) title = p.data().title;
                    } catch (e) {}
                    html += `<div class="review-item"><strong>${escapeHtml(title)}</strong><br><span style="color:#666;font-size:13px;">Status: ${escapeHtml(data.status || 'pending')}</span></div>`;
                }
                feedbackList.innerHTML = html;
            } else {
                if (reviewSnapshot.empty) {
                    feedbackList.innerHTML = '<p style="color:#999;">No feedback yet.</p>';
                    return;
                }
                let html = '';
                reviewSnapshot.forEach(doc => {
                    const r = doc.data();
                    html += `<div class="review-item"><p>${starString(r.rating)}</p>${r.comment ? `<p>${escapeHtml(r.comment)}</p>` : ''}</div>`;
                });
                feedbackList.innerHTML = html;
            }
        } else {
            // Landlord/agent: listings count + reviews aggregated across their properties
            const propSnapshot = await db.collection('properties').where('ownerId', '==', uid).get();
            if (statNum) statNum.textContent = propSnapshot.size;

            if (propSnapshot.empty) {
                feedbackList.innerHTML = '<p style="color:#999;">No properties listed yet.</p>';
                if (!isOwn) {
                    document.getElementById('pubRatingStars').textContent = starString(0);
                    document.getElementById('pubRatingLabel').textContent = '0.0';
                }
                return;
            }

            const propertyIds = propSnapshot.docs.map(d => d.id).slice(0, 10);
            const reviewSnapshot = await db.collection('reviews').where('propertyId', 'in', propertyIds).get();

            if (!isOwn) {
                let total = 0;
                reviewSnapshot.forEach(d => total += d.data().rating);
                const avg = reviewSnapshot.size ? total / reviewSnapshot.size : 0;
                document.getElementById('pubRatingStars').textContent = starString(avg);
                document.getElementById('pubRatingLabel').textContent = `${avg.toFixed(1)} from ${reviewSnapshot.size}`;
            }

            if (reviewSnapshot.empty) {
                feedbackList.innerHTML = '<p style="color:#999;">No reviews yet.</p>';
                return;
            }

            const titleById = {};
            propSnapshot.docs.forEach(d => { titleById[d.id] = d.data().title; });

            let html = '';
            reviewSnapshot.forEach(doc => {
                const r = doc.data();
                html += `
                    <div class="review-item">
                        <p>${starString(r.rating)} <span style="color:#666;font-size:13px;">— ${escapeHtml(titleById[r.propertyId] || 'Property')}</span></p>
                        ${r.comment ? `<p>${escapeHtml(r.comment)}</p>` : ''}
                    </div>
                `;
            });
            feedbackList.innerHTML = html;
        }
    } catch (error) {
        console.error('Error loading stats/feedback:', error);
        feedbackList.innerHTML = '<p style="color:#c62828;">Could not load this section.</p>';
    }
}
