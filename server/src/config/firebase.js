const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

let credential;

// Preferred method: point straight at the downloaded service account JSON file.
// This avoids ALL the private-key-escaping problems that happen when pasting
// a multi-line key into a .env file (very common on Windows).
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

if (serviceAccountPath) {
  const resolvedPath = path.resolve(serviceAccountPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_PATH is set to "${serviceAccountPath}" but no file exists there. ` +
      `Check the path in your .env file (use forward slashes even on Windows, e.g. C:/Users/you/serviceAccountKey.json).`
    );
  }
  const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  credential = admin.credential.cert(serviceAccount);
} else {
  // Fallback method: individual env vars (kept for platforms like Render/Railway
  // where uploading a JSON file isn't convenient).
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
    throw new Error(
      "Missing Firebase credentials. Either set FIREBASE_SERVICE_ACCOUNT_PATH to point at your " +
      "downloaded service account JSON file (recommended), or set FIREBASE_PROJECT_ID, " +
      "FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY individually in your .env file."
    );
  }

  credential = admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: privateKey,
  });
}

if (!admin.apps.length) {
  admin.initializeApp({ credential });
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
