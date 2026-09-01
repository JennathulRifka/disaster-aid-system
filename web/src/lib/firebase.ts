// Initializes the Firebase client SDK (used by the browser/React app).
// This is DIFFERENT from the Admin SDK used on the backend — this one
// is safe to expose in frontend code; these values are not secret.
//
// Get these values from: Firebase Console > Project Settings > General
// > scroll to "Your apps" > Web app > SDK setup and configuration

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getMessaging, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

// Firestore client SDK — used for real-time onSnapshot listeners on admin
// pages. Writes still go through the Express API (which validates business
// rules like priority scoring and category caps); this is read-only.
export const db = getFirestore(firebaseApp);

// Cloud Messaging — push notifications (delivery status updates, area
// disaster alerts). `getMessaging()` throws in browsers/contexts that don't
// support the Push API (Safari on iOS below 16.4, non-HTTPS/non-localhost
// origins), so this resolves to `null` there instead of crashing the whole
// app on import — see lib/notifications.ts, the only place this is used.
export const messagingPromise = isSupported().then((supported) => (supported ? getMessaging(firebaseApp) : null));
