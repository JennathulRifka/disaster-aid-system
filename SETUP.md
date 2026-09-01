# Setup Guide — Steps 1 to 7

This is the current, complete version — it replaces earlier instructions (which had you extracting UI from Lovable and pasting private keys into `.env`; neither is needed anymore).

You already have the project at `C:\Users\SINGER\Documents\GitHub\disaster-aid-system\` — these steps assume that's your project root. Run everything in VS Code's terminal.

---

## STEP 1 — Secure the old Lovable repo (one-time, skip if already done)

In your **original** `aid-stream` repo (not this one):

```powershell
git clone https://github.com/JennathulRifka/aid-stream.git
cd aid-stream
type .env
```

If real secrets are in there: regenerate them in your Supabase dashboard (Settings → API), then:

```powershell
git rm --cached .env
echo .env >> .gitignore
git add .gitignore
git commit -m "Remove committed .env"
git push
```

This is unrelated to the project going forward — just closes the leak.

---

## STEP 2 — Confirm your project folder structure

You should have:

```
disaster-aid-system/
  server/     <- Node/Express + Firebase backend
  web/        <- React + Vite + Tailwind frontend
  firestore-rules/
  SETUP.md
```

If any of `server/` or `web/` are missing files, re-extract them from the zip I gave you into the matching folder.

---

## STEP 3 — Backend: install and configure

```powershell
cd disaster-aid-system\server
npm install
copy .env.example .env
```

Add `.gitignore` (copy the one from the zip into this folder if it's not already there) — this stops `.env` and your Firebase key from ever being committed.

You'll fill in the actual values in `.env` in Step 4.

---

## STEP 4 — Firebase Console setup

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → create a project (or open your existing one).
2. **Firestore:** left sidebar → Build → Firestore Database → Create database → **test mode**.
3. **Authentication:** left sidebar → Build → Authentication → Get started → enable **Email/Password**.
4. **Backend credentials (service account):**
   - Project Settings (gear icon, top left) → Service Accounts tab → **Generate new private key** → a `.json` file downloads.
   - Move that file **outside** `disaster-aid-system` entirely — e.g. straight into `C:\Users\SINGER\Documents\serviceAccountKey.json`. Never inside a git-tracked folder.
   - Open `server\.env` and set it up like this:
     ```
     PORT=5000
     FIREBASE_SERVICE_ACCOUNT_PATH=C:/Users/SINGER/Documents/serviceAccountKey.json
     CLIENT_ORIGIN=http://localhost:5173
     ```
     **Use forward slashes**, even though Windows normally shows backslashes — this exact point is what caused your last error.
5. **Frontend credentials (web app config):**
   - Same Project Settings page → scroll to "Your apps" → click the `</>` (web) icon → register an app (any nickname) → don't check "Firebase Hosting" → Register.
   - It shows a `firebaseConfig` object — you'll use these values in Step 5.

---

## STEP 5 — Web app: install and configure

```powershell
cd ..\web
npm install
copy .env.example .env
```

Open `web\.env` and fill in the values from the `firebaseConfig` object you just saw:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_API_URL=http://localhost:5000
```

Copy the `web/.gitignore` from the zip into this folder too, if it isn't there already.

---

## STEP 6 — Run everything

Two terminals in VS Code (right-click in the terminal panel → Split Terminal):

**Terminal 1:**
```powershell
cd disaster-aid-system\server
npm run dev
```
Expect: `Disaster Aid API listening on http://localhost:5000`
Visit `http://localhost:5000` in a browser — you should see `{"status":"ok",...}`.

**Terminal 2:**
```powershell
cd disaster-aid-system\web
npm run dev
```
Open the URL it prints — usually `http://localhost:5173`.

**Test it:** go to `/register`, create a victim account, log in, submit a test aid request. Then register a second account as `admin`, log in, go to `/admin/requests`, and confirm you see the request with a priority score, and can approve it.

---

## STEP 7 — Deploy Firestore security rules

Do this once Step 6 is working end to end.

```powershell
npm install -g firebase-tools
firebase login
cd ..\..\disaster-aid-system
firebase init firestore
```
When it asks for the rules file location, point it to `firestore-rules/firestore.rules`.

```powershell
firebase deploy --only firestore:rules
```

---

## Common errors — exact fixes

| Error | Fix |
|---|---|
| `Missing Firebase credentials` | `server/.env` isn't filled in — redo Step 4 |
| `...but no file exists there` | Path is wrong, or using backslashes — must be forward slashes |
| `Invalid PEM formatted message` | You're using the old private-key-in-.env method — switch to `FIREBASE_SERVICE_ACCOUNT_PATH` |
| CORS error in browser console | Add your frontend URL to `CLIENT_ORIGIN` in `server/.env`, restart the server |
| `401 Invalid or expired token` | Not logged in, or token not attached — check `auth.currentUser` isn't null |
| `403 No profile found for this user` | Registration didn't finish — check `/api/users/profile` was called |
| `Cannot find module` | Forgot `npm install` in that specific folder |
| `EADDRINUSE :::5000` | Port taken — change `PORT` in `.env` or close the other process |
| Firestore `PERMISSION_DENIED` | Paste me the exact error and which action triggered it |

---

## What to send me

Run through Steps 3-6 and tell me exactly where it stops working (paste the error), or confirm it's all running — then we go back to matching the remaining screens to your screenshots.
