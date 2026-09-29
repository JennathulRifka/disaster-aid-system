# Deploying to Vercel

This deploys the whole app as **one Vercel project with two services**, sharing one domain: `web` (the React/Vite frontend) at `/`, and `server` (the Express API) reachable only at `/api/*`. `vercel.json` at the repo root already defines both services, the routing between them, and two scheduled Cron Jobs that replace two of `server`'s background checks (see "Known limitation" below).

This is additive, not a replacement for local development — `cd server && npm run dev` / `cd web && npm run dev` still works exactly as documented in `SETUP.md`, unaffected by anything here.

## Prerequisites

- A free Vercel account (Hobby plan) — sign up at vercel.com, ideally with your GitHub account so the import step in Step 1 is one click.
- This repo already pushed to GitHub (confirmed: `origin` is `github.com/JennathulRifka/disaster-aid-system`).
- Your real Firebase service account JSON file (the one at whatever path `FIREBASE_SERVICE_ACCOUNT_PATH` points to in your local `server/.env`) — you'll need to copy three values out of it in Step 2.

## Step 1 — Import the project

1. Go to [vercel.com/new](https://vercel.com/new), choose **Import Git Repository**, and select this repo.
2. Vercel should detect `vercel.json` and its two services automatically (framework detection: `server` → Express, `web` → Vite). If it instead offers you a single generic "root directory" prompt, just click through — the `vercel.json` at the repo root takes over once the first deploy runs.
3. **Don't click Deploy yet** — go set the environment variables first (Step 2), or the first build will fail on missing Firebase credentials.

## Step 2 — Environment variables

Vercel's import screen (or **Project Settings → Environment Variables** afterward) lets you scope a variable to one service. Set these on the **`server`** service:

| Variable | Value | Notes |
|---|---|---|
| `FIREBASE_PROJECT_ID` | from your service account JSON's `project_id` field | |
| `FIREBASE_CLIENT_EMAIL` | from your service account JSON's `client_email` field | |
| `FIREBASE_PRIVATE_KEY` | from your service account JSON's `private_key` field | **Paste it exactly as it appears in the JSON file** — it already contains literal `\n` sequences (backslash-n as two characters, not real line breaks); `server/src/config/firebase.js` converts those to real newlines at runtime. Don't "fix" it into a multi-line value yourself. |
| `CLIENT_ORIGIN` | your Vercel deployment's URL once you know it (e.g. `https://your-project.vercel.app`), or leave as the local default for now and update after the first deploy | Only matters for a direct cross-origin call to the API; browser calls from `web` go through the same-origin rewrite and never hit CORS at all. Safe to leave loose while testing. |
| `OPENWEATHER_API_KEY` | your real key | Optional — without it, `GET /api/external/weather` just returns `[]`. |
| `TEXTLK_API_TOKEN` | your real token | Optional — without it, SMS sends are silently skipped. |
| `TEXTLK_SENDER_ID` | `TextLKDemo` (or your approved sender ID) | |
| `CRON_SECRET` | any random string you generate (e.g. `openssl rand -hex 32`, or just mash the keyboard) | Protects `/api/cron/*` from being triggered by anyone who finds the URL — Vercel automatically sends this as a bearer token on its own cron-triggered requests once it's set. |

**Don't set `FIREBASE_SERVICE_ACCOUNT_PATH`** on Vercel — a Vercel Function has no stable local file to point at; the three separate `FIREBASE_*` variables above are `firebase.js`'s built-in fallback for exactly this situation, and take over automatically when the path variable is absent.

Set these on the **`web`** service (copy straight from your local `web/.env`):

| Variable | Notes |
|---|---|
| `VITE_FIREBASE_API_KEY` | |
| `VITE_FIREBASE_AUTH_DOMAIN` | |
| `VITE_FIREBASE_PROJECT_ID` | |
| `VITE_FIREBASE_STORAGE_BUCKET` | |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | |
| `VITE_FIREBASE_APP_ID` | |
| `VITE_FIREBASE_VAPID_KEY` | for push notifications |
| `VITE_GOOGLE_MAPS_API_KEY` | for volunteer navigation |

**Do NOT set `VITE_API_URL`** on the `web` service — leaving it unset is what makes `web/src/lib/api.ts` fall back to a relative `/api/...` path in the production build, which is what actually reaches `server` through `vercel.json`'s rewrite. Setting it to anything (even the Vercel URL itself) would still work, but there's no reason to — leaving it unset is simpler and matches what the code already expects.

## Step 3 — Deploy

Click **Deploy**. Vercel builds both services and wires up the rewrites. Every future `git push` to your default branch triggers a new deploy automatically — no manual redeploy step needed for future changes.

## Step 4 — Verify it actually works

Once deployed, using the real `*.vercel.app` URL Vercel gives you:

1. Open it in a browser — the landing page should load (the `web` service).
2. Open `<your-url>/api/stats` directly — should return real JSON (proves the `/api/(.*)` rewrite is correctly reaching `server`, not a 404).
3. Register a throwaway account and confirm login/dashboard works end-to-end — this exercises the Firebase Admin SDK credentials from Step 2.
4. In the Vercel dashboard, check **Project → Cron Jobs** — both `/api/cron/water-levels` and `/api/cron/reservoirs` should be listed with their schedule.

## Known limitation — worth stating plainly, including in the viva

`server.js`'s original design polls for river-gauge and reservoir escalations **every 10 minutes and hourly** via a `setInterval` loop — this works exactly as-is on `localhost` or any persistent host (Render, Railway), because the Node process never stops running.

Vercel Functions are serverless — they don't stay alive between requests, so that loop can't survive there. The fix (`server/src/routes/cron.js` + `vercel.json`'s `crons` array) replaces it with real **Vercel Cron Jobs**. But Vercel's **free Hobby plan caps cron jobs at once per day** — so on the deployed Vercel version, a rising water level or reservoir is only checked once daily, not near-real-time.

This is a genuine, disclosed tradeoff, not a bug: the Vercel deployment is real, working, and demonstrates actual deployment competency and an awareness of serverless constraints — but the **localhost version still runs the original 10-minute/hourly cadence**, unchanged, because `server.js` itself was deliberately left untouched. For a viva demo of the water-level/reservoir alert *escalation-detection* feature specifically, run it locally; for demonstrating the live deployed system generally, use the Vercel URL.

## Redeploying after a change

Just `git push`. Vercel rebuilds both services from the same commit and keeps environment variables as configured — nothing else to run.
