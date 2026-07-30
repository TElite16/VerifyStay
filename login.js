// =====================
// VERIFYSTAY - Login/Signup Logic (Phone OTP + Firestore write)
// Uses the global `auth` and `db` from firebase-config.js
// =====================

let selectedRole = 'tenant';
let isSignupFlow = true;
let confirmationResult = null;
let isPhoneVerified = false;
let formattedPhone = '';

const errorDiv = document.getElementById('errorMessage');
const successDiv = document.getElementById('successMessage');
const signupFields = document.getElementById('signupFields');
const phoneVerification = document.getElementById('phoneVerification');
const sendOtpBtn = document.getElementById('sendOtpBtn');
const verifyOtpBtn = document.getElementById('verifyOtpBtn');
const otpRow = document.getElementById('otpRow');
const otpCode = document.getElementById('otpCode');
const otpStatus = document.getElementById('otpStatus');
const verifiedBadge = document.getElementById('verifiedBadge');
const submitBtn = document.getElementById('submitBtn');
const toggleLink = document.getElementById('toggleLink');
const toggleText = document.getElementById('toggleText');
const fullNameInput = document.getElementById('fullName');
const phoneInput = document.getElementById('phone');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

// ---------------- Pre-fill role from ?role= query param ----------------
const urlParams = new URLSearchParams(window.location.search);
const roleParam = urlParams.get('role');
if (roleParam && ['tenant', 'landlord', 'agent'].includes(roleParam)) {
    selectedRole = roleParam;
}

document.querySelectorAll('.role-selector button').forEach(btn => {
    if (btn.dataset.role === selectedRole) btn.classList.add('active');
    else btn.classList.remove('active');

    btn.addEventListener('click', function () {
        document.querySelectorAll('.role-selector button').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        selectedRole = this.dataset.role;
    });
});

// ---------------- Toggle login / signup ----------------
toggleLink.addEventListener('click', function () {
    isSignupFlow = !isSignupFlow;
    signupFields.style.display = isSignupFlow ? 'block' : 'none';
    toggleText.textContent = isSignupFlow ? 'Already have an account?' : 'New to VerifyStay?';
    toggleLink.textContent = isSignupFlow ? 'Login' : 'Sign Up';
    hideError();
    hideSuccess();
    resetPhoneVerification();
    updateSubmitButton();
});

// ---------------- reCAPTCHA + phone OTP ----------------
window.addEventListener('load', function () {
    try {
        window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
            size: 'normal',
            callback: function () { sendOtpBtn.disabled = false; },
            'expired-callback': function () { sendOtpBtn.disabled = true; }
        });
        window.recaptchaVerifier.render();
    } catch (e) {
        console.error('reCAPTCHA init error:', e);
    }
});

sendOtpBtn.addEventListener('click', async function () {
    let phone = phoneInput.value.trim();

    if (!phone) {
        showStatus('Please enter your phone number.', 'error');
        return;
    }

    // Format for Nigeria (+234)
    if (phone.startsWith('0')) {
        formattedPhone = '+234' + phone.substring(1);
    } else if (phone.startsWith('+')) {
        formattedPhone = phone;
    } else {
        formattedPhone = '+234' + phone;
    }

    showStatus('Sending verification code...', 'info');
    sendOtpBtn.disabled = true;

    try {
        confirmationResult = await auth.signInWithPhoneNumber(formattedPhone, window.recaptchaVerifier);
        otpRow.style.display = 'flex';
        sendOtpBtn.textContent = 'Code Sent ✓';
        showStatus('✅ Verification code sent to ' + formattedPhone, 'success');
        otpCode.focus();
    } catch (error) {
        console.error('Phone auth error:', error);
        showStatus('Failed to send code: ' + error.message, 'error');
        sendOtpBtn.disabled = false;
    }
});

verifyOtpBtn.addEventListener('click', async function () {
    const code = otpCode.value.trim();

    if (!code || code.length < 6) {
        showStatus('Please enter the 6-digit code.', 'error');
        return;
    }

    showStatus('Verifying code...', 'info');

    try {
        await confirmationResult.confirm(code);
        isPhoneVerified = true;
        verifiedBadge.style.display = 'inline-block';
        otpRow.style.display = 'none';
        sendOtpBtn.style.display = 'none';
        showStatus('✅ Phone verified successfully!', 'success');
        updateSubmitButton();
    } catch (error) {
        console.error('OTP verification error:', error);
        showStatus('❌ Invalid code. Please try again.', 'error');
        otpCode.value = '';
        otpCode.focus();
    }
});

function resetPhoneVerification() {
    isPhoneVerified = false;
    confirmationResult = null;
    otpRow.style.display = 'none';
    sendOtpBtn.style.display = 'inline-block';
    sendOtpBtn.textContent = 'Send Verification Code';
    verifiedBadge.style.display = 'none';
    otpStatus.innerHTML = '';
    otpCode.value = '';
}

function updateSubmitButton() {
    if (!isSignupFlow) {
        // Login mode: phone verification not required
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
    } else if (isPhoneVerified) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Complete Sign Up';
    } else {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sign Up (Verify Phone First)';
    }
}

// ---------------- Form submit (signup / login) ----------------
document.getElementById('authForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    hideError();
    hideSuccess();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        showError('Please fill in all required fields.');
        return;
    }
    if (password.length < 6) {
        showError('Password must be at least 6 characters.');
        return;
    }

    if (isSignupFlow) {
        if (!isPhoneVerified) {
            showError('Please verify your phone number before signing up.');
            return;
        }
        const name = fullNameInput.value.trim();
        if (!name) {
            showError('Please enter your full name.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating account...';

        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // Note: `verified` starts FALSE on purpose — it only becomes true
            // once the uploaded ownership document has been manually reviewed.
            // Phone verification alone is a lower trust tier (`phoneVerified`).
            await db.collection('users').doc(user.uid).set({
                name: name,
                email: email,
                phone: formattedPhone,
                role: selectedRole,
                rating: 0,
                flags: 0,
                phoneVerified: true,
                verified: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            showSuccess('✅ Account created! Redirecting to your dashboard...');
            setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
        } catch (error) {
            console.error('Signup error:', error);
            showError('Signup failed: ' + error.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Complete Sign Up';
        }
    } else {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Logging in...';
        try {
            await auth.signInWithEmailAndPassword(email, password);
            showSuccess('✅ Login successful! Redirecting...');
            setTimeout(() => { window.location.href = 'dashboard.html'; }, 800);
        } catch (error) {
            console.error('Login error:', error);
            showError('Login failed: ' + error.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Login';
        }
    }
});

// ---------------- UI helpers ----------------
function showError(message) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    successDiv.style.display = 'none';
}
function showSuccess(message) {
    successDiv.textContent = message;
    successDiv.style.display = 'block';
    errorDiv.style.display = 'none';
}
function hideError() { errorDiv.style.display = 'none'; }
function hideSuccess() { successDiv.style.display = 'none'; }
function showStatus(message, type) {
    otpStatus.textContent = message;
    otpStatus.style.color = type === 'error' ? '#c62828' : type === 'success' ? '#2e7d32' : '#0d47a1';
}

// Initialize button state
updateSubmitButton();
