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
                <h2 style="font-family:'Fraunces',serif;margin-top:10px;">${contractData.type === 'tenancy' ? 'Tenancy Agreement' : 'Caretaker Agreement'}</h2>
                <p style="color:#666;">${escapeHtml(contractData.propertyTitle || 'Property')}</p>
                <p style="font-size:13px;color:#999;">${isRecipient ? 'From' : 'To'}: ${escapeHtml(isRecipient ? (contractData.fromRole || 'sender') : (contractData.toUserName || 'recipient'))}</p>

                <div class="contract-terms">${escapeHtml(contractData.terms || '')}</div>

                <div class="signature-block">
                    <div class="signature-box">
                        <div class="sig-name">${contractData.fromSignature ? escapeHtml(contractData.fromSignature) : '— pending —'}</div>
                        <div>${escapeHtml(contractData.fromRole || 'Sender')} ${contractData.fromSignedAt ? '· ' + contractData.fromSignedAt.toDate().toLocaleDateString() : ''}</div>
                    </div>
                    <div class="signature-box">
                        <div class="sig-name">${contractData.toSignature ? escapeHtml(contractData.toSignature) : '— pending —'}</div>
                        <div>${contractData.type === 'tenancy' ? 'Tenant' : 'Agent'} ${contractData.toSignedAt ? '· ' + contractData.toSignedAt.toDate().toLocaleDateString() : ''}</div>
                    </div>
                </div>

                <div id="responseArea" style="margin-top:20px;"></div>
                <div id="escrowArea" style="margin-top:20px;"></div>
            </div>
        `;

        if (isRecipient && contractData.status === 'pending') {
            renderResponseOptions();
        }
        if (contractData.type === 'tenancy' && contractData.status === 'accepted') {
            renderEscrowSection();
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

            if (contractData.type === 'caretaker') {
                // Assign the caretaker on the property itself
                await db.collection('properties').doc(contractData.propertyId).update({
                    caretakerRoleActive: true,
                    caretakerAgentId: contractData.toUserId,
                    caretakerCommissionPercent: contractData.commissionPercent,
                    caretakerStartDate: firebase.firestore.FieldValue.serverTimestamp()
                });
                await createNotification(contractData.fromUserId, 'contract', `${contractData.toUserName || 'The agent'} accepted the caretaker agreement for "${contractData.propertyTitle}"`, `property-details.html?id=${contractData.propertyId}`);
                alert('Agreement accepted! You are now the caretaker for this property.');
            } else {
                // Tenancy agreement — just a signed record for now; actual
                // move-in still happens through the separate "Confirm
                // Payment & Move In" step once real payment exists.
                await createNotification(contractData.fromUserId, 'contract', `${contractData.toUserName || 'The tenant'} signed the tenancy agreement for "${contractData.propertyTitle}"`, `property-details.html?id=${contractData.propertyId}`);
                alert('Agreement accepted and signed!');
            }
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

// =====================================================================
// ESCROW — NOT connected to a real payment/escrow provider yet (that
// needs an account with something like Vesicash, plus a small backend
// to call their API securely). This models the intended flow so it's
// ready to wire up: tenant "pays" into escrow, funds show as held,
// tenant taps Checked In to release or Refund to reverse — nothing
// here moves real money yet.
// =====================================================================
// Flip this to true the moment a real escrow provider (e.g. Vesicash)
// is actually integrated with real API credentials. Until then, real
// users should never see a payment button that doesn't move real
// money — they get clear guidance to use the existing manual
// "Confirm Payment & Move In" flow instead, which needs no payment
// gateway at all and already works fully.
// =====================================================================
const ESCROW_LIVE = window.ESCROW_LIVE;

const isTenantHere = () => currentUser.uid === contractData.toUserId;

async function renderEscrowSection() {
    const area = document.getElementById('escrowArea');

    if (!ESCROW_LIVE) {
        area.innerHTML = `
            <div style="background:#F7F8FA;border-radius:8px;padding:16px;">
                <p style="font-weight:600;margin-bottom:6px;">💳 Payment</p>
                <p style="font-size:14px;color:#666;">In-app escrow payment isn't connected yet. For now, arrange rent payment directly (bank transfer, same as normal) — once received, the landlord/agent confirms it from the property page ("Confirm Payment & Move In"), which starts the lease and updates availability automatically.</p>
            </div>
        `;
        return;
    }

    let existing = null;
    try {
        const snapshot = await db.collection('escrowTransactions')
            .where('contractId', '==', contractId)
            .get();
        if (!snapshot.empty) existing = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    } catch (e) { console.warn(e); }

    if (!existing) {
        if (!isTenantHere()) {
            area.innerHTML = `<p style="color:#666;font-size:14px;">Waiting for the tenant to pay via escrow.</p>`;
            return;
        }
        let propertyData = {};
        try {
            const propDoc = await db.collection('properties').doc(contractData.propertyId).get();
            if (propDoc.exists) propertyData = propDoc.data();
        } catch (e) {}
        const b = getPriceBreakdown(propertyData);
        area.innerHTML = `
            <div style="background:#F7F8FA;border-radius:8px;padding:16px;">
                <p style="font-weight:600;margin-bottom:8px;">💳 Pay via Escrow <span style="font-weight:400;color:#999;font-size:12px;">(demo — no real payment gateway connected yet)</span></p>
                <div style="font-size:14px;color:#666;">
                    <div style="display:flex;justify-content:space-between;"><span>House Rent</span><span>₦${b.rent.toLocaleString()}</span></div>
                    <div style="display:flex;justify-content:space-between;"><span>Service/Repair Fee</span><span>₦${b.serviceFee.toLocaleString()}</span></div>
                    ${b.commissionFee ? `<div style="display:flex;justify-content:space-between;"><span>Agent Commission</span><span>₦${b.commissionFee.toLocaleString()}</span></div>` : ''}
                    <div style="display:flex;justify-content:space-between;"><span>VerifyStay Platform Fee</span><span>₦${b.verifyStayFee.toLocaleString()}</span></div>
                    <div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px solid #ddd;margin-top:4px;padding-top:4px;"><span>Total</span><span>₦${b.total.toLocaleString()}</span></div>
                </div>
                <p style="font-size:12px;color:#666;margin-top:8px;">🔒 Everyone's share — including VerifyStay's — stays held until you confirm check-in. Full refund available any time before then.</p>
                <button class="btn btn-primary" style="margin-top:10px;" onclick="payIntoEscrow(${b.rent},${b.serviceFee},${b.commissionFee},${b.verifyStayFee},${b.total})">Pay ₦${b.total.toLocaleString()} (Demo)</button>
            </div>
        `;
        return;
    }

    const statusView = {
        held: { label: '🔒 Held in Escrow', color: '#e65100', bg: '#fff3e0' },
        released: { label: '✅ Released', color: '#2e7d32', bg: '#e8f5e9' },
        refunded: { label: '↩️ Refunded to Tenant', color: '#c62828', bg: '#ffebee' }
    }[existing.status];

    area.innerHTML = `
        <div style="background:${statusView.bg};border-radius:8px;padding:16px;">
            <p style="font-weight:600;color:${statusView.color};">${statusView.label}</p>
            <p style="font-size:13px;color:#666;">Total: ₦${existing.totalAmount.toLocaleString()} — Landlord: ₦${existing.landlordAmount.toLocaleString()}, ${existing.agentAmount ? `Agent: ₦${existing.agentAmount.toLocaleString()}, ` : ''}VerifyStay: ₦${existing.verifyStayAmount.toLocaleString()}</p>
            ${(existing.status === 'held' && isTenantHere()) ? `
                <div style="display:flex;gap:10px;margin-top:10px;">
                    <button class="btn btn-primary" onclick="confirmCheckIn('${existing.id}')">✅ I've Checked In</button>
                    <button class="btn btn-outline" onclick="requestEscrowRefund('${existing.id}')">🚫 Request Refund</button>
                </div>
            ` : ''}
        </div>
    `;
}

async function payIntoEscrow(rent, serviceFee, commissionFee, verifyStayFee, total) {
    if (!confirm(`Confirm: pay ₦${total.toLocaleString()} into escrow? (Demo — no real payment happens.)`)) return;
    try {
        let landlordId = contractData.fromUserId; // whoever prepared/sent the tenancy agreement
        let agentId = commissionFee > 0 ? landlordId : null; // simplification until agent/landlord are separately tracked per-transaction

        await db.collection('escrowTransactions').add({
            contractId: contractId,
            propertyId: contractData.propertyId,
            propertyTitle: contractData.propertyTitle,
            tenantId: currentUser.uid,
            landlordId: landlordId,
            agentId: agentId,
            totalAmount: total,
            rentAmount: rent,
            serviceFeeAmount: serviceFee,
            commissionAmount: commissionFee,
            verifyStayAmount: verifyStayFee,
            landlordAmount: rent + serviceFee,
            status: 'held',
            releaseCondition: 'check_in_confirmed',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await createNotification(landlordId, 'escrow', `Payment held in escrow for "${contractData.propertyTitle}" — released once the tenant checks in.`, `contract.html?id=${contractId}`);

        alert('Payment recorded as held in escrow (demo).');
        renderEscrowSection();
    } catch (error) {
        console.error('Error paying into escrow:', error);
        alert('Could not process: ' + error.message);
    }
}
window.payIntoEscrow = payIntoEscrow;

async function confirmCheckIn(txId) {
    if (!confirm('Confirm you have the keys and have checked in? This releases the held funds.')) return;
    try {
        await db.collection('escrowTransactions').doc(txId).update({
            status: 'released',
            releasedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await createNotification(contractData.fromUserId, 'escrow', `Tenant checked in for "${contractData.propertyTitle}" — escrow funds released.`, `contract.html?id=${contractId}`);
        alert('Checked in! Funds released (demo).');
        renderEscrowSection();
    } catch (error) {
        console.error('Error confirming check-in:', error);
        alert('Could not update: ' + error.message);
    }
}
window.confirmCheckIn = confirmCheckIn;

async function requestEscrowRefund(txId) {
    const reason = prompt('What went wrong? (e.g. never got keys, property not as described)');
    if (!reason) return;
    try {
        await db.collection('escrowTransactions').doc(txId).update({
            status: 'refunded',
            refundReason: reason,
            refundedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await createNotification(contractData.fromUserId, 'escrow', `Tenant requested a refund for "${contractData.propertyTitle}": ${reason}`, `contract.html?id=${contractId}`);
        alert('Refund requested (demo) — full amount would return to you once a real escrow provider is connected.');
        renderEscrowSection();
    } catch (error) {
        console.error('Error requesting refund:', error);
        alert('Could not update: ' + error.message);
    }
}
window.requestEscrowRefund = requestEscrowRefund;
