// =====================
// VERIFYSTAY - Dispute Form Logic
// v1 scope: submits to Firestore for manual/admin mediation review.
// Real-time AI mediation needs a server-side function (with a securely
// stored API key) and is intentionally NOT wired up here — never put an
// AI provider API key in public client-side JS.
// =====================

let currentUser = null;
let currentRole = null;

auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = user;

    const doc = await db.collection('users').doc(user.uid).get();
    currentRole = doc.exists ? doc.data().role : 'tenant';

    populateAgainstOptions();
});

function populateAgainstOptions() {
    const select = document.getElementById('disputeAgainst');
    select.innerHTML = '<option value="">Select...</option>';

    // Only the allowed pairings: Landlord<->Agent, Tenant<->Agent.
    // No direct Landlord<->Tenant disputes.
    let options = [];
    if (currentRole === 'tenant') {
        options = [{ value: 'agent', label: 'The Agent managing this property' }];
    } else if (currentRole === 'landlord') {
        options = [{ value: 'agent', label: 'The Agent managing my property' }];
    } else if (currentRole === 'agent') {
        options = [
            { value: 'landlord', label: 'A Landlord I work with' },
            { value: 'tenant', label: 'A Tenant I work with' }
        ];
    }

    options.forEach(opt => {
        const el = document.createElement('option');
        el.value = opt.value;
        el.textContent = opt.label;
        select.appendChild(el);
    });
}

document.getElementById('disputeForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    hideError();

    const against = document.getElementById('disputeAgainst').value;
    const description = document.getElementById('disputeDescription').value.trim();
    const propertyId = document.getElementById('propertyIdInput').value.trim();

    if (!against || !description) {
        showError('Please select who this is against and describe the issue.');
        return;
    }

    try {
        await db.collection('disputes').add({
            raisedBy: currentUser.uid,
            raisedByRole: currentRole,
            againstRole: against,
            propertyId: propertyId || null,
            description: description,
            status: 'open',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        document.getElementById('disputeForm').style.display = 'none';
        document.getElementById('successMessage').style.display = 'block';
    } catch (error) {
        console.error('Error submitting dispute:', error);
        showError('Could not submit dispute: ' + error.message);
    }
});

function showError(message) {
    const div = document.getElementById('errorMessage');
    div.textContent = message;
    div.style.display = 'block';
}
function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}
