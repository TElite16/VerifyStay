// =====================
// FIREBASE CONFIG - COMPAT VERSION (CDN)
// Replace the values below with YOUR config from:
// Firebase Console -> Project Settings -> Your apps -> Web app
// =====================

const firebaseConfig = {
    apiKey: "AIzaSyABjzQW1TK-ookwit2OokNh0mLVc8R8f5w",
    authDomain: "verifystay-4a87e.firebaseapp.com",
    projectId: "verifystay-4a87e",
    storageBucket: "verifystay-4a87e.firebasestorage.app",
    messagingSenderId: "930594897186",
    appId: "1:930594897186:web:67ff44ae9c4d39173ff97b"
};

// Initialize Firebase (requires the compat SDK <script> tags loaded BEFORE this file)
firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();
const auth = firebase.auth();

// NOTE: Firebase Storage is NOT initialized right now — as of Feb 2026,
// Firebase Storage requires the paid Blaze plan even for free-tier usage.
// We're using Cloudinary (free, no card) for photo/document uploads instead.
// When you're ready to switch back to Firebase Storage later, uncomment
// the two lines below and re-add firebase-storage-compat.js to your pages:
//
// const storage = firebase.storage();
// window.storage = storage;

// Make available globally so every page's JS can use db / auth directly
window.db = db;
window.auth = auth;
