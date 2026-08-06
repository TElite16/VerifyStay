// =====================
// VERIFYSTAY - Post Property Logic (COMPLETE, with real Storage upload)
// =====================

let map;
let marker;
let selectedFiles = [];
let coverPhotoIndex = 0;
let selectedDoc = null;
let currentUid = null;
let currentRole = 'landlord';

auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    currentUid = user.uid;

    try {
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            const data = doc.data();
            if (data.role !== 'landlord' && data.role !== 'agent') {
                alert('Only landlords and agents can post properties.');
                window.location.href = 'dashboard.html';
                return;
            }
            currentRole = data.role;
            // Agents listing on a landlord's behalf need to record who the landlord is
            if (currentRole === 'agent') {
                const group = document.getElementById('landlordFieldsGroup');
                if (group) group.style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Error checking user role:', error);
    }

    initMap();
    setupFileUploads();
    setupFormSubmit(user.uid);
});

function initMap() {
    const defaultPos = [9.0820, 8.6753]; // Nigeria center
    map = L.map('map').setView(defaultPos, 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    map.on('click', function (e) {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;

        if (marker) map.removeLayer(marker);
        marker = L.marker([lat, lng]).addTo(map);

        document.getElementById('latitude').value = lat;
        document.getElementById('longitude').value = lng;
    });

    setupMapsLinkPaste();
}

// Lets an agent/landlord paste a Google Maps link or raw coordinates
// (e.g. from long-pressing a spot in the Google Maps app and copying the
// coordinates shown) instead of having to find and drag a pin manually.
function parseLatLngFromInput(value) {
    if (!value) return null;
    value = value.trim();

    // Plain "lat, lng" (what you get from long-pressing a pin in Google Maps
    // and tapping the coordinates to copy them)
    let m = value.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    // Full Google Maps URL containing "@lat,lng"
    m = value.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    // Google Maps URL containing "?q=lat,lng" or "&q=lat,lng"
    m = value.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    return null;
}

function setupMapsLinkPaste() {
    const input = document.getElementById('mapsLinkInput');
    const btn = document.getElementById('useMapsLinkBtn');
    if (!input || !btn) return;

    function applyFromInput() {
        const result = parseLatLngFromInput(input.value);
        if (!result) {
            alert('Could not read a location from that. Try pasting just the coordinates (e.g. 6.5244, 3.3792), or a Google Maps link that contains "@lat,lng" — short links like maps.app.goo.gl/... unfortunately don\'t work here since they need Google\'s servers to expand.');
            return;
        }
        if (marker) map.removeLayer(marker);
        marker = L.marker([result.lat, result.lng]).addTo(map);
        map.setView([result.lat, result.lng], 16);
        document.getElementById('latitude').value = result.lat;
        document.getElementById('longitude').value = result.lng;
    }

    btn.addEventListener('click', applyFromInput);
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); applyFromInput(); }
    });
}

// Renders the selected photos as thumbnails with a clickable star so the
// agent/landlord can choose which one shows as the listing's main photo
// (the "cover") in Feed and on the homepage. Defaults to the first photo.
function renderPhotoPreviews() {
    const preview = document.getElementById('filePreview');
    preview.innerHTML = '';
    if (selectedFiles.length === 0) return;

    const hint = document.createElement('p');
    hint.style.cssText = 'font-size:13px;color:#666;margin-bottom:8px;width:100%;';
    hint.textContent = '⭐ Tap the star on a photo to set it as the main listing photo.';
    preview.appendChild(hint);

    selectedFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'position:relative;display:inline-block;margin:4px;';

            const img = document.createElement('img');
            img.src = e.target.result;
            img.className = 'preview-image';
            if (index === coverPhotoIndex) {
                img.style.border = '3px solid #C9A227';
            }

            const star = document.createElement('button');
            star.type = 'button';
            star.textContent = index === coverPhotoIndex ? '⭐ Cover' : '☆ Set as cover';
            star.style.cssText = 'position:absolute;bottom:4px;left:4px;right:4px;font-size:11px;padding:3px 6px;border:none;border-radius:6px;cursor:pointer;background:rgba(15,44,89,0.85);color:#fff;';
            star.addEventListener('click', () => {
                coverPhotoIndex = index;
                renderPhotoPreviews();
            });

            wrap.appendChild(img);
            wrap.appendChild(star);
            preview.appendChild(wrap);
        };
        reader.readAsDataURL(file);
    });
}

function setupFileUploads() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const preview = document.getElementById('filePreview');

    uploadArea.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', function () {
        preview.innerHTML = '';
        selectedFiles = Array.from(this.files).slice(0, 5);
        coverPhotoIndex = 0; // default to first photo as cover each time a new selection is made
        renderPhotoPreviews();
    });

    const docUploadArea = document.getElementById('docUploadArea');
    const docInput = document.getElementById('docInput');
    const docPreview = document.getElementById('docPreview');

    docUploadArea.addEventListener('click', () => docInput.click());

    docInput.addEventListener('change', function () {
        if (this.files.length > 0) {
            selectedDoc = this.files[0];
            docPreview.innerHTML = `<p style="color:#2e7d32;">✅ Selected: ${escapeHtml(selectedDoc.name)}</p>`;
        }
    });
}

// Uploads one file to Cloudinary (free, no card) using an unsigned upload
// preset, and returns its public URL. See cloudinary-config.js for setup.
async function uploadFile(file, folder) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', window.CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', folder);

    const response = await fetch(
        `https://api.cloudinary.com/v1_1/${window.CLOUDINARY_CLOUD_NAME}/auto/upload`,
        { method: 'POST', body: formData }
    );

    if (!response.ok) {
        const errText = await response.text();
        throw new Error('Upload failed: ' + errText);
    }

    const data = await response.json();
    return data.secure_url;
}

function setupFormSubmit(userId) {
    const form = document.getElementById('propertyForm');
    const submitBtn = document.getElementById('submitBtn');
    const progressDiv = document.getElementById('uploadProgress');

    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        hideError();
        document.getElementById('successMessage').style.display = 'none';

        const title = document.getElementById('title').value.trim();
        const propertyType = document.getElementById('propertyType').value;
        const city = document.getElementById('city').value;
        const area = document.getElementById('area').value.trim();
        const address = document.getElementById('address').value.trim();
        const price = document.getElementById('price').value;
        const lat = document.getElementById('latitude').value;
        const lng = document.getElementById('longitude').value;

        if (!title || !propertyType || !city || !area || !address || !price || !lat || !lng) {
            showError('Please fill in all required fields and drop a pin on the map.');
            return;
        }
        if (!selectedDoc) {
            showError('Please upload a verification document.');
            return;
        }
        if (selectedFiles.length === 0) {
            showError('Please upload at least one property photo — listings without a photo don\'t show a thumbnail to tenants.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Uploading...';

        try {
            // 1. Upload document
            progressDiv.textContent = 'Uploading document...';
            const docUrl = await uploadFile(
                selectedDoc,
                `verification-docs/${userId}`
            );

            // 2. Upload photos (if any)
            const photoUrls = [];
            for (let i = 0; i < selectedFiles.length; i++) {
                progressDiv.textContent = `Uploading photo ${i + 1} of ${selectedFiles.length}...`;
                const url = await uploadFile(
                    selectedFiles[i],
                    `properties/${userId}`
                );
                photoUrls.push(url);
            }

            progressDiv.textContent = 'Saving listing...';

            // 3. Look up actual role (don't trust a hardcoded default)
            let ownerRole = 'landlord';
            const userDoc = await db.collection('users').doc(userId).get();
            if (userDoc.exists) {
                ownerRole = userDoc.data().role || 'landlord';
            }

            // 4. Save property doc — ownerId MUST equal auth uid to satisfy Firestore rules
            const propertyData = {
                title: title,
                propertyType: propertyType,
                city: city,
                area: area,
                address: address,
                price: parseFloat(price),
                bedrooms: parseInt(document.getElementById('bedrooms').value) || 0,
                description: document.getElementById('description').value.trim(),
                latitude: parseFloat(lat),
                longitude: parseFloat(lng),
                documentUrl: docUrl,
                photoUrls: photoUrls,
                coverIndex: coverPhotoIndex,
                ownerId: userId,
                ownerRole: ownerRole,
                status: 'pending',   // only an admin flips this to 'active'
                verified: false,     // only an admin flips this after document review
                rating: 0,
                reviewCount: 0,
                flags: 0,
                // Landlord-authorization fields (only meaningful when ownerRole === 'agent').
                // Landlord can later "claim" this property by verifying the same phone
                // number on VerifyStay — an admin links the two accounts manually for now.
                landlordName: ownerRole === 'agent' ? (document.getElementById('landlordName').value.trim() || null) : null,
                landlordPhone: ownerRole === 'agent' ? (document.getElementById('landlordPhone').value.trim() || null) : null,
                authorizedByLandlord: false,   // admin flips true once landlord confirms authorization
                authorizationDate: null,       // admin sets when authorization is confirmed
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await db.collection('properties').add(propertyData);
            console.log('Property saved:', docRef.id);

            progressDiv.textContent = '';
            document.getElementById('successMessage').style.display = 'block';
            document.getElementById('successMessage').textContent =
                `✅ "${title}" listed successfully! Awaiting verification.`;

            form.reset();
            document.getElementById('latitude').value = '';
            document.getElementById('longitude').value = '';
            if (marker) map.removeLayer(marker);
            document.getElementById('filePreview').innerHTML = '';
            document.getElementById('docPreview').innerHTML = '';
            selectedFiles = [];
            coverPhotoIndex = 0;
            selectedDoc = null;

            document.getElementById('successMessage').scrollIntoView({ behavior: 'smooth' });
        } catch (error) {
            console.error('Error saving property:', error);
            showError('Failed to save property: ' + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'List Property (Free)';
            progressDiv.textContent = '';
        }
    });
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    errorDiv.scrollIntoView({ behavior: 'smooth' });
}
function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}
