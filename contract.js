// =====================
// VERIFYSTAY - Contract Viewing & Response
// =====================

let currentUser = null;
let contractId = null;
let contractData = null;

auth.onAuthStateChanged((user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = user;
    const params = new URLSearchParams(window.location.search);
    contractId = params.get('id');
    if (!contractId) {
        document.getElementById('contractContainer').innerHTML = '<p style="color:#c62828;">No agreement specified.</p>';
        return;
    }
    renderContract();
});

async function renderContract() {
    const container = document.getElementById('contractContainer');
    try {
        const doc = await db.collection('contracts').doc(contractId).get();
        if (!doc.exists) {
            container.innerHTML = '<p style="color:#c62828;">Agreement not found.</p>';
            return;
        }
        contractData = doc.data();

        if (currentUser.uid !== contractData.fromUserId && currentUser.uid !== contractData.toUserId) {
            container.innerHTML = '<p style="color:#c62828;">You don\'t have access to this agreement.</p>';
            return;
        }

        const isRecipient = currentUser.uid === contractData.toUserId;
        const statusClass = `status-${contractData.status}`;
        const statusLabel = contractData.status.charAt(0).toUpperCase() + contractData.status.slice(1);

        container.innerHTML = `
            <div class="contract-card">
                <p><span class="status-pill ${statusClass}">${statusLabel}</span></p>
                <h2 style="font-family:'Fraunces',serif;margin-top:10px;">Caretaker Agreement</h2>
                <p style="color:#666;">${escapeHtml(contractData.propertyTitle || 'Property')}</p>

                <div class="contract-terms">${escapeHtml(contractData.terms || '')}</div>

                <div class="signature-block">
                    <div class="signature-box">
                        <div class="sig-name">${contractData.fromSignature ? escapeHtml(contractData.fromSignature) : '— pending —'}</div>
                        <div>Landlord ${contractData.fromSignedAt ? '· ' + contractData.fromSignedAt.toDate().toLocaleDateString() : ''}</div>
                    </div>
                    <div class="signature-box">
                        <div class="sig-name">${contractData.toSignature ? escapeHtml(contractData.toSignature) : '— pending —'}</div>
                        <div>Agent ${contractData.toSignedAt ? '· ' + contractData.toSignedAt.toDate().toLocaleDateString() : ''}</div>
                    </div>
                </div>

                <div id="responseArea" style="margin-top:20px;"></div>
            </div>
        `;

        if (isRecipient && contractData.status === 'pending') {
            renderResponseOptions();
        }
    } catch (error) {
        console.error('Error loading contract:', error);
        container.innerHTML = '<p style="color:#c62828;">Could not load this agreement.</p>';
    }
}

function renderResponseOptions() {
    const area = document.getElementById('responseArea');
    area.innerHTML = `
        <div class="form-group">
            <label>Your Signature (to accept)</label>
            <input type="text" id="myContractSignature" placeholder="Type your full legal name">
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="respondToContract('accepted')">✅ Accept & Sign</button>
            <button class="btn btn-outline" onclick="respondToContract('declined')">❌ Decline</button>
            <button class="btn btn-outline" onclick="askToRenegotiate()">💬 Ask to Renegotiate</button>
        </div>
    `;
    db.collection('users').doc(currentUser.uid).get().then(doc => {
        if (doc.exists && doc.data().signatureName) {
            document.getElementById('myContractSignature').value = doc.data().signatureName;
        }
    });
}

async function respondToContract(decision) {
    if (decision === 'accepted') {
        const signature = document.getElementById('myContractSignature').value.trim();
        if (!signature) {
            alert('Please type your name as your signature to accept.');
            return;
        }
        try {
            await db.collection('contracts').doc(contractId).update({
                status: 'accepted',
                toSignature: signature,
                toSignedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Assign the caretaker on the property itself
            await db.collection('properties').doc(contractData.propertyId).update({
                caretakerRoleActive: true,
                caretakerAgentId: contractData.toUserId,
                caretakerCommissionPercent: contractData.commissionPercent,
                caretakerStartDate: firebase.firestore.FieldValue.serverTimestamp()
            });

            await createNotification(contractData.fromUserId, 'contract', `${contractData.toUserName || 'The agent'} accepted the caretaker agreement for "${contractData.propertyTitle}"`, `property-details.html?id=${contractData.propertyId}`);

            alert('Agreement accepted! You are now the caretaker for this property.');
            renderContract();
        } catch (error) {
            console.error('Error accepting contract:', error);
            alert('Could not accept: ' + error.message);
        }
    } else {
        try {
            await db.collection('contracts').doc(contractId).update({ status: 'declined' });
            await createNotification(contractData.fromUserId, 'contract', `The caretaker agreement for "${contractData.propertyTitle}" was declined`, `property-details.html?id=${contractData.propertyId}`);
            alert('Agreement declined.');
            renderContract();
        } catch (error) {
            console.error('Error declining contract:', error);
            alert('Could not decline: ' + error.message);
        }
    }
}
window.respondToContract = respondToContract;

// Simplest, honest version of "renegotiate" — opens a direct chat with
// the other party instead of a formal revision/versioning flow, so
// terms can be discussed before a new agreement is prepared.
function askToRenegotiate() {
    window.location.href = `chat.html?with=${contractData.fromUserId}&propertyId=${contractData.propertyId}&propertyTitle=${encodeURIComponent(contractData.propertyTitle || 'Property')}`;
}
window.askToRenegotiate = askToRenegotiate;
