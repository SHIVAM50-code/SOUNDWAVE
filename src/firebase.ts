// src/firebase.ts
// ─────────────────────────────────────────────────────────────────────────────
// SETUP INSTRUCTIONS (one-time, ~5 minutes):
// 1. Go to https://console.firebase.google.com
// 2. Click "Add project" → name it "Soundwave" → Continue (disable Analytics ok)
// 3. Left sidebar: Authentication → Get started → Google → Enable → Save
// 4. Left sidebar: Firestore Database → Create database → Start in test mode → Next → Enable
// 5. Left sidebar: Project Settings (⚙ gear icon) → scroll to "Your apps" → </> Web
//    → Register app name "Soundwave" → copy the firebaseConfig object below
// 6. Replace the placeholder values below with your real values and save.
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// ← REPLACE with your Firebase project config from step 5 above
const firebaseConfig = {
  apiKey: "AIzaSyDlBVdAYcRxeXHpMJfqiCP3A0K1AfmpMLw",
  authDomain: "soundwave-21950.firebaseapp.com",
  projectId: "soundwave-21950",
  storageBucket: "soundwave-21950.firebasestorage.app",
  messagingSenderId: "736004004925",
  appId: "1:736004004925:web:3feaae0d6253d9872d5e54",
  measurementId: "G-63E050GDJZ"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const isFirebaseConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";
