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

// Edit-mode state — set when arriving via post-property.html?edit=<propertyId>
let editPropertyId = null;
let existingPhotoUrls = [];
let existingCoverIndex = 0;
let existingDocUrl = null;
let existingUnitsAvailable = null;

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

    // Edit mode: post-property.html?edit=<propertyId>
    const params = new URLSearchParams(window.location.search);
    const editId = params.get('edit');
    if (editId) {
        editPropertyId = editId;
        await loadPropertyForEdit(editId, user.uid);
    }
});

// Loads an existing property into the form for editing. Only the owner can
// edit their own listing — everyone else gets bounced back to the dashboard.
async function loadPropertyForEdit(propertyId, userId) {
    try {
        const doc = await db.collection('properties').doc(propertyId).get();
        if (!doc.exists) {
            alert('That listing could not be found.');
            window.location.href = 'dashboard.html';
            return;
        }
        const p = doc.data();
        if (p.ownerId !== userId) {
            alert('You can only edit your own listings.');
            window.location.href = 'dashboard.html';
            return;
        }

        document.getElementById('title').value = p.title || '';
        document.getElementById('propertyType').value = p.propertyType || '';
        document.getElementById('city').value = p.city || '';
        document.getElementById('area').value = p.area || '';
        document.getElementById('address').value = p.address || '';
        document.getElementById('price').value = p.price || '';
        document.getElementById('bedrooms').value = p.bedrooms || '';
        document.getElementById('unitsTotal').value = p.unitsTotal || 1;
        existingUnitsAvailable = (typeof p.unitsAvailable === 'number') ? p.unitsAvailable : (p.unitsTotal || 1);
        document.getElementById('description').value = p.description || '';

        if (currentRole === 'agent') {
            document.getElementById('landlordName').value = p.landlordName || '';
            document.getElementById('landlordPhone').value = p.landlordPhone || '';
        }

        if (p.latitude && p.longitude) {
            document.getElementById('latitude').value = p.latitude;
            document.getElementById('longitude').value = p.longitude;
            marker = L.marker([p.latitude, p.longitude]).addTo(map);
            map.setView([p.latitude, p.longitude], 15);
        }

        existingPhotoUrls = p.photoUrls || [];
        existingCoverIndex = p.coverIndex || 0;
        existingDocUrl = p.documentUrl || null;
        renderExistingPhotoPreviews();

        // Update page chrome to make it obvious this is an edit, not a new listing
        const heading = document.querySelector('h2');
        if (heading) heading.textContent = '✏️ Edit Your Property';
        const subhead = document.querySelector('.subtitle, p.subtitle');
        if (subhead) subhead.textContent = 'Changes go live immediately — the 4-hour "Not yet verified" badge will show again.';
        const submitBtn = document.getElementById('submitBtn');
        if (submitBtn) submitBtn.textContent = 'Save Changes';
    } catch (error) {
        console.error('Error loading property for edit:', error);
        alert('Could not load that listing for editing: ' + error.message);
        window.location.href = 'dashboard.html';
    }
}

// Shows the property's current photos when editing, with a note that
// uploading new ones will replace them entirely.
function renderExistingPhotoPreviews() {
    if (existingPhotoUrls.length === 0) return;
    const preview = document.getElementById('filePreview');
    preview.innerHTML = '';

    const note = document.createElement('p');
    note.style.cssText = 'font-size:13px;color:#666;margin-bottom:8px;width:100%;';
    note.textContent = 'Current photos shown below. Choose new photos above only if you want to replace all of them.';
    preview.appendChild(note);

    existingPhotoUrls.forEach((url, index) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;display:inline-block;margin:4px;';
        const img = document.createElement('img');
        img.src = url;
        img.className = 'preview-image';
        if (index === existingCoverIndex) img.style.border = '3px solid #C9A227';
        const label = document.createElement('div');
        label.style.cssText = 'font-size:11px;text-align:center;padding:2px;color:#666;';
        label.textContent = index === existingCoverIndex ? '⭐ Current cover' : 'Existing photo';
        wrap.appendChild(img);
        wrap.appendChild(label);
        preview.appendChild(wrap);
    });
}

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
    const status = document.getElementById('mapsLinkStatus');
    if (!input || !btn) return;

    function applyFromInput() {
        const result = parseLatLngFromInput(input.value);
        if (!result) {
            if (status) {
                status.style.color = '#c62828';
                status.textContent = '❌ Could not read a location from that. Paste just the coordinates (e.g. 6.5244, 3.3792), or a Google Maps link containing "@lat,lng". Short links (maps.app.goo.gl/...) don\'t work here.';
            }
            return;
        }
        if (marker) map.removeLayer(marker);
        marker = L.marker([result.lat, result.lng]).addTo(map);
        map.setView([result.lat, result.lng], 16);
        document.getElementById('latitude').value = result.lat;
        document.getElementById('longitude').value = result.lng;
        if (status) {
            status.style.color = '#2e7d32';
            status.textContent = `✅ Pin placed at ${result.lat.toFixed(5)}, ${result.lng.toFixed(5)} — check the map below looks right.`;
        }
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
// uploadFile() now lives in app.js (shared with login.js/profile.js)

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
        if (!selectedDoc && !(editPropertyId && existingDocUrl)) {
            showError('Please upload a verification document.');
            return;
        }
        if (selectedFiles.length === 0 && !(editPropertyId && existingPhotoUrls.length > 0)) {
            showError('Please upload at least one property photo — listings without a photo don\'t show a thumbnail to tenants.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Uploading...';

        try {
            // 1. Upload document (only if a new one was chosen; otherwise keep the existing one)
            let docUrl = existingDocUrl;
            if (selectedDoc) {
                progressDiv.textContent = 'Uploading document...';
                docUrl = await uploadFile(
                    selectedDoc,
                    `verification-docs/${userId}`
                );
            }

            // 2. Upload photos (only if new ones were chosen; otherwise keep existing)
            let photoUrls = existingPhotoUrls;
            let finalCoverIndex = editPropertyId ? existingCoverIndex : coverPhotoIndex;
            if (selectedFiles.length > 0) {
                photoUrls = [];
                for (let i = 0; i < selectedFiles.length; i++) {
                    progressDiv.textContent = `Uploading photo ${i + 1} of ${selectedFiles.length}...`;
                    const url = await uploadFile(
                        selectedFiles[i],
                        `properties/${userId}`
                    );
                    photoUrls.push(url);
                }
                finalCoverIndex = coverPhotoIndex;
            }

            progressDiv.textContent = 'Saving listing...';

            // 3. Look up actual role (don't trust a hardcoded default)
            let ownerRole = 'landlord';
            const userDoc = await db.collection('users').doc(userId).get();
            if (userDoc.exists) {
                ownerRole = userDoc.data().role || 'landlord';
            }

            // 4. Save property doc.
            // NEW listing: full document, ownerId MUST equal auth uid (Firestore rules require this).
            // EDIT: only update editable fields — never touch rating/flags/ownerId/createdAt,
            // and reset status/verified so an edited listing gets re-reviewed before going live.
            let docRef;
            if (editPropertyId) {
                const updateData = {
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
                    coverIndex: finalCoverIndex,
                    status: 'active',
                    verified: false,
                    verificationWindowStart: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                const newUnitsTotal = Math.max(1, parseInt(document.getElementById('unitsTotal').value) || 1);
                updateData.unitsTotal = newUnitsTotal;
                // Can't have more units "available" than the total — clamp down
                // if the total was corrected to something smaller than before.
                updateData.unitsAvailable = Math.min(existingUnitsAvailable !== null ? existingUnitsAvailable : newUnitsTotal, newUnitsTotal);
                if (currentRole === 'agent') {
                    updateData.landlordName = document.getElementById('landlordName').value.trim() || null;
                    updateData.landlordPhone = document.getElementById('landlordPhone').value.trim() || null;
                }
                await db.collection('properties').doc(editPropertyId).update(updateData);
                docRef = { id: editPropertyId };
                console.log('Property updated:', editPropertyId);
            } else {
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
                    coverIndex: finalCoverIndex,
                    ownerId: userId,
                    ownerRole: ownerRole,
                    unitsTotal: Math.max(1, parseInt(document.getElementById('unitsTotal').value) || 1),
                    unitsAvailable: Math.max(1, parseInt(document.getElementById('unitsTotal').value) || 1), // all units start available
                    status: 'active',   // goes live immediately — no more admin approval gate
                    verified: false,     // optional extra badge an admin can still grant after reviewing the utility bill
                    verificationWindowStart: firebase.firestore.FieldValue.serverTimestamp(), // drives the 4-hour "Not yet verified" badge
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
                docRef = await db.collection('properties').add(propertyData);
                console.log('Property saved:', docRef.id);
            }

            progressDiv.textContent = '';
            document.getElementById('successMessage').style.display = 'block';
            document.getElementById('successMessage').textContent = editPropertyId
                ? `✅ Changes saved and live immediately! It'll show "Not yet verified" for 4 hours while we check the details.`
                : `✅ "${title}" is live now! It'll show "Not yet verified" for 4 hours while we check the details.`;

            if (editPropertyId) {
                document.getElementById('successMessage').scrollIntoView({ behavior: 'smooth' });
                setTimeout(() => { window.location.href = 'dashboard.html'; }, 1800);
                return;
            }

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
