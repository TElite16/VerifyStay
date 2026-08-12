// =====================
// VERIFYSTAY - My Agreements List
// =====================

let currentUser = null;
let allAgreements = [];

auth.onAuthStateChanged((user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = user;
    loadAgreements();
});

async function loadAgreements() {
    const list = document.getElementById('agreementsList');
    try {
        const [fromSnapshot, toSnapshot] = await Promise.all([
            db.collection('contracts').where('fromUserId', '==', currentUser.uid).get(),
            db.collection('contracts').where('toUserId', '==', currentUser.uid).get()
        ]);

        const seen = new Set();
        allAgreements = [];
        fromSnapshot.forEach(doc => { allAgreements.push({ id: doc.id, iAmSender: true, ...doc.data() }); seen.add(doc.id); });
        toSnapshot.forEach(doc => { if (!seen.has(doc.id)) allAgreements.push({ id: doc.id, iAmSender: false, ...doc.data() }); });

        allAgreements.sort((a, b) => {
            const ta = a.createdAt ? a.createdAt.toMillis() : 0;
            const tb = b.createdAt ? b.createdAt.toMillis() : 0;
            return tb - ta;
        });

        renderList('all');
    } catch (error) {
        console.error('Error loading agreements:', error);
        list.innerHTML = '<p style="color:#c62828;">Could not load agreements.</p>';
    }
}

function renderList(filter) {
    const list = document.getElementById('agreementsList');
    const items = filter === 'all' ? allAgreements : allAgreements.filter(a => a.status === filter);

    if (items.length === 0) {
        list.innerHTML = '<p style="color:#999;text-align:center;padding:30px 0;">No agreements here yet.</p>';
        return;
    }

    list.innerHTML = items.map(a => {
        const otherLabel = a.iAmSender ? (a.toUserName || 'Recipient') : 'Sender';
        const typeLabel = a.type === 'caretaker' ? '🤝 Caretaker Agreement' : '🏠 Tenancy Agreement';
        const when = a.createdAt ? a.createdAt.toDate().toLocaleDateString() : '';
        return `
            <a href="contract.html?id=${a.id}" class="agreement-item">
                <div class="top-row">
                    <span class="property">${escapeHtml(a.propertyTitle || 'Property')}</span>
                    <span class="status-pill status-${a.status}">${a.status}</span>
                </div>
                <div class="meta">${typeLabel} · ${a.iAmSender ? 'Sent to' : 'From'} ${escapeHtml(otherLabel)} · ${when}</div>
            </a>
        `;
    }).join('');
}

function filterAgreements(filter) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab' + filter.charAt(0).toUpperCase() + filter.slice(1)).classList.add('active');
    renderList(filter);
}
window.filterAgreements = filterAgreements;
