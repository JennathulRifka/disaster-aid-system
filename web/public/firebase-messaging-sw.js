// Firebase Cloud Messaging background service worker. Must live at this
// exact path (site root) — the FCM SDK looks for /firebase-messaging-sw.js
// by convention. Handles notifications that arrive while the app tab isn't
// focused/open; foreground messages are handled in lib/notifications.ts
// instead (FCM never fires onBackgroundMessage for a page that's frontmost).
//
// This is a plain script loaded directly by the browser, not bundled by
// Vite, so it can't read import.meta.env — the config values below are
// duplicated from web/.env by hand. That's fine: these are Firebase's public
// client identifiers (not secrets, see the comment in lib/firebase.ts) and
// they already ship inside the built JS bundle sent to every visitor anyway.
// If you ever rotate/change the Firebase web app config, update both places.
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCFeOCGBgocBZ7ZBu7lfdjdc-zhKHSZ8p4",
  authDomain: "disaster-aid-system.firebaseapp.com",
  projectId: "disaster-aid-system",
  storageBucket: "disaster-aid-system.firebasestorage.app",
  messagingSenderId: "578755390692",
  appId: "1:578755390692:web:81a31c04fe9c02dedd90f1",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || "Disaster Aid", {
    body: body || "",
    icon: "/vite.svg",
  });
});
