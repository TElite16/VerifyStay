// =====================
// VERIFYSTAY - Settings
// =====================

auth.onAuthStateChanged((user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    initSettings();
});

function initSettings() {
    // Dark mode
    const darkToggle = document.getElementById('darkModeToggle');
    darkToggle.checked = localStorage.getItem('vsDarkMode') === 'true';
    darkToggle.addEventListener('change', function () {
        setDarkMode(this.checked);
    });

    // Notification sound
    const soundToggle = document.getElementById('soundToggle');
    soundToggle.checked = localStorage.getItem('vsNotifSound') !== 'false'; // defaults ON
    soundToggle.addEventListener('change', function () {
        localStorage.setItem('vsNotifSound', this.checked ? 'true' : 'false');
    });

    // Browser notification permission
    updateNotifPermUI();
    document.getElementById('notifPermBtn').addEventListener('click', requestNotifPermission);
}

function updateNotifPermUI() {
    const btn = document.getElementById('notifPermBtn');
    const status = document.getElementById('notifPermStatus');

    if (!('Notification' in window)) {
        btn.style.display = 'none';
        status.textContent = 'Not supported in this browser.';
        return;
    }

    if (Notification.permission === 'granted') {
        btn.textContent = 'Enabled';
        btn.disabled = true;
        status.textContent = '✅ You\'ll get notified even when this tab isn\'t focused.';
    } else if (Notification.permission === 'denied') {
        btn.textContent = 'Blocked';
        btn.disabled = true;
        status.textContent = 'Blocked in your browser/phone settings — you\'ll need to allow notifications for this site there to turn it back on.';
    } else {
        btn.textContent = 'Enable';
        btn.disabled = false;
        status.textContent = 'Off — tap Enable to allow, your phone will ask for permission.';
    }
}

async function requestNotifPermission() {
    if (!('Notification' in window)) return;
    try {
        await Notification.requestPermission();
    } catch (e) {
        console.warn('Notification permission request failed:', e);
    }
    updateNotifPermUI();
}
