// =====================
// VERIFYSTAY - Profile Logic
// =====================

let currentUser = null;

auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = user;
    await renderProfile();
});

async function renderProfile() {
    const card = document.getElementById('profileCard');
    try {
        const doc = await db.collection('users').doc(currentUser.uid).get();
        if (!doc.exists) {
            card.innerHTML = '<p>Profile not found.</p>';
            return;
        }
        const data = doc.data();

        card.innerHTML = `
            <h2>My Profile</h2>
            <div class="profile-row"><span>Role</span><strong style="text-transform:capitalize;">${escapeHtml(data.role || '')}</strong></div>
            <div class="profile-row"><span>Rating</span><strong>${starString(data.rating || 0)} ${(data.rating || 0).toFixed(1)}</strong></div>
            <div class="profile-row"><span>Flags</span><strong>${data.flags || 0}</strong></div>
            <div class="profile-row"><span>Phone verified</span><strong>${data.phoneVerified ? '✅ Yes' : '❌ No'}</strong></div>
            <div class="profile-row"><span>Document verified</span><strong>${data.verified ? '✅ Yes' : 'Pending review'}</strong></div>

            <div class="form-group">
                <label>Full Name</label>
                <input type="text" id="editName" value="${escapeHtml(data.name || '')}">
            </div>
            <div class="form-group">
                <label>Phone</label>
                <input type="text" id="editPhone" value="${escapeHtml(data.phone || '')}" disabled>
                <small style="color:#666;">Phone number can't be changed here — it's tied to your verified OTP.</small>
            </div>
            <button class="btn btn-primary" style="margin-top:16px;" onclick="saveProfile()">Save Changes</button>
            <div id="successMessage" class="success-message">✅ Profile updated.</div>
        `;
    } catch (error) {
        console.error('Error loading profile:', error);
        card.innerHTML = '<p style="color:#c62828;">Error loading profile.</p>';
    }
}

async function saveProfile() {
    const name = document.getElementById('editName').value.trim();
    if (!name) {
        alert('Name cannot be empty.');
        return;
    }
    try {
        // Only non-trust fields are editable here (name). Role, rating, flags,
        // verified, and phoneVerified are locked by Firestore rules.
        await db.collection('users').doc(currentUser.uid).update({ name: name });
        document.getElementById('successMessage').style.display = 'block';
    } catch (error) {
        console.error('Error saving profile:', error);
        alert('Could not save: ' + error.message);
    }
}

window.saveProfile = saveProfile;
