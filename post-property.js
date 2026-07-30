// =====================
// VERIFYSTAY - Post Property Logic (COMPLETE, with real Storage upload)
// =====================

let map;
let marker;
let selectedFiles = [];
let selectedDoc = null;
let currentUid = null;

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
}

function setupFileUploads() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const preview = document.getElementById('filePreview');

    uploadArea.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', function () {
        preview.innerHTML = '';
        selectedFiles = Array.from(this.files).slice(0, 5);
        selectedFiles.forEach(file => {
            const reader = new FileReader();
            reader.onload = function (e) {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.className = 'preview-image';
                preview.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
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
        const address = document.getElementById('address').value.trim();
        const price = document.getElementById('price').value;
        const lat = document.getElementById('latitude').value;
        const lng = document.getElementById('longitude').value;

        if (!title || !propertyType || !city || !address || !price || !lat || !lng) {
            showError('Please fill in all required fields and drop a pin on the map.');
            return;
        }
        if (!selectedDoc) {
            showError('Please upload a verification document.');
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
                address: address,
                price: parseFloat(price),
                bedrooms: parseInt(document.getElementById('bedrooms').value) || 0,
                description: document.getElementById('description').value.trim(),
                latitude: parseFloat(lat),
                longitude: parseFloat(lng),
                documentUrl: docUrl,
                photoUrls: photoUrls,
                ownerId: userId,
                ownerRole: ownerRole,
                status: 'pending',   // only an admin flips this to 'active'
                verified: false,     // only an admin flips this after document review
                rating: 0,
                reviewCount: 0,
                flags: 0,
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
