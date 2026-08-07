// =====================
// VERIFYSTAY - Login/Signup Logic
// NOTE: Firebase phone-number OTP now requires a paid Blaze billing account
// (Google changed this in Sept 2024), so v1 no longer tries to send SMS
// codes from the browser. Phone number is still collected and shown to
// admin — it gets confirmed by a real phone call as part of manual account
// review, the same way property documents are manually reviewed. Free
// Firebase email verification is used instead, since that has no cost.
// =====================

let selectedRole = 'tenant';
let isSignupFlow = true;

const errorDiv = document.getElementById('errorMessage');
const successDiv = document.getElementById('successMessage');
const signupFields = document.getElementById('signupFields');
const confirmPasswordGroup = document.getElementById('confirmPasswordGroup');
const pwMatchStatus = document.getElementById('pwMatchStatus');
const submitBtn = document.getElementById('submitBtn');
const toggleLink = document.getElementById('toggleLink');
const toggleText = document.getElementById('toggleText');
const fullNameInput = document.getElementById('fullName');
const phoneInput = document.getElementById('phone');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirmPassword');
const genderInput = document.getElementById('gender');
const profilePictureInput = document.getElementById('profilePicture');

// ---------------- Live profile picture preview ----------------
if (profilePictureInput) {
    profilePictureInput.addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById('pfpPreviewImg').src = e.target.result;
            document.getElementById('pfpPreviewImg').style.display = 'block';
            document.getElementById('pfpPlaceholder').style.display = 'none';
        };
        reader.readAsDataURL(file);
    });
}

// ---------------- Pre-fill role from ?role= query param ----------------
const urlParams = new URLSearchParams(window.location.search);
const roleParam = urlParams.get('role');
if (roleParam && ['tenant', 'landlord', 'agent'].includes(roleParam)) {
    selectedRole = roleParam;
}

// If arriving via a "Login" link (?mode=login), open straight on the
// Login form instead of Signup — avoids people having to toggle manually.
if (urlParams.get('mode') === 'login') {
    isSignupFlow = false;
    signupFields.style.display = 'none';
    confirmPasswordGroup.style.display = 'none';
    toggleText.textContent = 'New to VerifyStay?';
    toggleLink.textContent = 'Sign Up';
    submitBtn.textContent = 'Login';
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

// ---------------- Show/hide password toggles ----------------
document.querySelectorAll('.pw-toggle').forEach(btn => {
    btn.addEventListener('click', function () {
        const target = document.getElementById(this.dataset.target);
        if (target.type === 'password') {
            target.type = 'text';
            this.textContent = '🙈';
        } else {
            target.type = 'password';
            this.textContent = '👁️';
        }
    });
});

// ---------------- Live confirm-password match check ----------------
function checkPasswordsMatch() {
    if (!isSignupFlow) return true;
    if (!confirmPasswordInput.value) {
        pwMatchStatus.textContent = '';
        return false;
    }
    if (passwordInput.value === confirmPasswordInput.value) {
        pwMatchStatus.textContent = '✅ Passwords match';
        pwMatchStatus.style.color = '#2e7d32';
        return true;
    } else {
        pwMatchStatus.textContent = '❌ Passwords do not match';
        pwMatchStatus.style.color = '#c62828';
        return false;
    }
}
passwordInput.addEventListener('input', checkPasswordsMatch);
confirmPasswordInput.addEventListener('input', checkPasswordsMatch);

// ---------------- Toggle login / signup ----------------
toggleLink.addEventListener('click', function () {
    isSignupFlow = !isSignupFlow;
    signupFields.style.display = isSignupFlow ? 'block' : 'none';
    confirmPasswordGroup.style.display = isSignupFlow ? 'block' : 'none';
    toggleText.textContent = isSignupFlow ? 'Already have an account?' : 'New to VerifyStay?';
    toggleLink.textContent = isSignupFlow ? 'Login' : 'Sign Up';
    submitBtn.textContent = isSignupFlow ? 'Sign Up' : 'Login';
    hideError();
    hideSuccess();
    pwMatchStatus.textContent = '';
});

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
        const name = fullNameInput.value.trim();
        const phone = phoneInput.value.trim();
        const confirmPassword = confirmPasswordInput.value;

        if (!name) {
            showError('Please enter your full name.');
            return;
        }
        if (!phone) {
            showError('Please enter your phone number.');
            return;
        }
        if (password !== confirmPassword) {
            showError('Passwords do not match. Please re-type your password.');
            return;
        }

        // Format for Nigeria (+234), stored for admin reference/callback
        let formattedPhone;
        if (phone.startsWith('0')) {
            formattedPhone = '+234' + phone.substring(1);
        } else if (phone.startsWith('+')) {
            formattedPhone = phone;
        } else {
            formattedPhone = '+234' + phone;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating account...';

        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // Free email verification link (Firebase Auth email verification
            // has no cost, unlike SMS). Not required to use the app in v1,
            // but gives you a second confirmation signal per account.
            try { await user.sendEmailVerification(); } catch (e) { console.warn('Email verification send failed:', e); }

            // Profile picture is optional — upload it only if one was chosen,
            // so signup doesn't fail just because someone skipped this.
            let profilePictureUrl = null;
            const pfpFile = profilePictureInput && profilePictureInput.files[0];
            if (pfpFile) {
                try {
                    profilePictureUrl = await uploadFile(pfpFile, `profile-pictures/${user.uid}`);
                } catch (e) {
                    console.warn('Profile picture upload failed, continuing without it:', e);
                }
            }

            // Note: `verified` starts FALSE on purpose — it only becomes true
            // once the uploaded ownership document has been manually reviewed.
            // `phoneVerified` also starts FALSE now — admin confirms this by
            // calling the number directly during account review.
            await db.collection('users').doc(user.uid).set({
                name: name,
                email: email,
                phone: formattedPhone,
                gender: genderInput ? genderInput.value : '',
                profilePictureUrl: profilePictureUrl,
                role: selectedRole,
                rating: 0,
                flags: 0,
                phoneVerified: false,
                verified: false,
                agentLevel: 1,          // agents start at Level 1, admin raises this via Firebase Console
                landlordTier: 'new',    // 'new' -> 'established' -> 'trusted-portfolio', set by admin
                strikeCount: 0,         // "black flags" — admin-issued, private to the account owner
                banCount: 0,             // how many times this account has been banned (2wk, then 4wk, then 6wk...)
                suspendedUntil: null,   // admin sets a date to temporarily suspend an account
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            showSuccess('✅ Account created! Check your email to verify it, then check your dashboard. Redirecting...');
            setTimeout(() => { window.location.href = 'dashboard.html'; }, 1500);
        } catch (error) {
            console.error('Signup error:', error);
            showError('Signup failed: ' + error.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign Up';
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
