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
  // and Vercel, where uploading a JSON file isn't convenient).
  //
  // Strip a single pair of wrapping quotes if present — the most common way
  // this breaks in practice is pasting the value straight out of the
  // downloaded JSON file, including the surrounding double quotes from the
  // `"private_key": "..."` line, into a platform's env var UI. That turns a
  // valid PEM string into one with a stray `"` glued to each end, which
  // fails with a cryptic "Invalid PEM formatted message" error that gives no
  // hint what's actually wrong.
  const stripWrappingQuotes = (value) =>
    value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;

  const privateKey = stripWrappingQuotes((process.env.FIREBASE_PRIVATE_KEY || "").trim()).replace(/\\n/g, "\n");
  const projectId = stripWrappingQuotes((process.env.FIREBASE_PROJECT_ID || "").trim());
  const clientEmail = stripWrappingQuotes((process.env.FIREBASE_CLIENT_EMAIL || "").trim());

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase credentials. Either set FIREBASE_SERVICE_ACCOUNT_PATH to point at your " +
      "downloaded service account JSON file (recommended), or set FIREBASE_PROJECT_ID, " +
      "FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY individually in your .env file."
    );
  }

  credential = admin.credential.cert({
    projectId,
    clientEmail,
    privateKey,
  });
}

if (!admin.apps.length) {
  admin.initializeApp({ credential });
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
