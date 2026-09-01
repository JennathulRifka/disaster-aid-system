// Initializes the Firebase client SDK for the mobile app. Same Firebase
// project as the web app — these values are not secret, safe in client code.
// DIFFERENT from web/src/lib/firebase.ts only in how auth persists: web uses
// the browser's own storage automatically, React Native needs AsyncStorage
// wired in explicitly via getReactNativePersistence, or a logged-in user
// would be signed out every time the app restarts.

import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseApp = initializeApp(firebaseConfig);

export const auth = initializeAuth(firebaseApp, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Firestore client SDK — used for real-time onSnapshot listeners, same as
// the web app. Writes still go through the Express API (business-rule
// validation lives there: priority scoring, category caps, etc.).
export const db = getFirestore(firebaseApp);
