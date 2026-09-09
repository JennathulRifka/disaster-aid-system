# Manual Test Results — E2E, UI/Cross-Cutting, and Security

Generated: 2026-09-03 (point-in-time — the user has flagged that some UI changes are still planned, so this should be re-run after those land)

Method: live, real browser interaction (Chromium via automated tooling) against the actual running app (`localhost:5173` + `localhost:5000`) and the real Firebase project, using four throwaway test accounts (victim/donor/volunteer/admin). All test accounts and documents were deleted afterward.

## Summary

| Category | Result |
|---|---|
| E. End-to-end functional testing | **All flows passed** |
| F. UI / cross-cutting testing | **1 real bug found** (mobile header layout) — everything else passed |
| G. Security testing | **All checks passed** |

---

## E. End-to-end functional testing

Walked the full golden path plus every feature added since the original scope, not just the original happy path.

| Step | Result |
|---|---|
| Victim submits a multi-category request (Food) with location capture | PASS — request created, correct "Pending" status |
| Admin approves the request | PASS — live-listener table updated to "Verified" with no reload |
| Donor registers a volunteer-delivery donation (Food) | PASS |
| Admin "Find match" — auto-assignment | PASS — correctly auto-assigned the one volunteer with a location on file, delivery created in `pending_acceptance` |
| Volunteer accepts the delivery | PASS — status → "Accepted", chat buttons (💬 Donor / 💬 Victim) appeared |
| Delivery chat opens and sends a message | PASS (see also Security section — XSS check) |
| Chat mutual-consent flow (one-sided) | PASS — correctly shows "waiting for the donor to agree too," does not reveal contact |
| Volunteer marks picked up → delivered | PASS — QR code rendered on "Delivered" |
| Victim confirms receipt via the real confirm endpoint (token from the QR payload) | PASS — see Security section for the token-validation check |
| Overall request status recomputation | PASS — flipped to "delivered" once the only item was confirmed |
| SOS: victim submits → admin acknowledges → in progress → resolved | PASS, both via direct API and via the live `/admin/sos` dispatch board UI |
| Community report: volunteer submits → correctly invisible publicly while unverified → admin verifies → becomes publicly visible | PASS |
| Admin secondary pages load without error: Categories, Broadcast, Active Emergencies, Water Alerts, Community Reports, Audit Log, Volunteer Workload, Resource Gap, Situation Map | PASS — no console errors on any page |

## F. UI / cross-cutting testing

| Check | Result |
|---|---|
| i18n — Sinhala on the public landing page | PASS — full translation, no raw i18n keys detected |
| i18n — Tamil on the public landing page | PASS — full translation, no raw i18n keys detected |
| Responsive — mobile viewport (375px), English | **FAIL — see finding below** |
| Responsive — mobile viewport (375px), Tamil | **FAIL — same issue, worse (longer button labels)** |

### Finding: Landing page header doesn't lay out correctly on narrow mobile viewports

**Not a translation bug** — reproduces in English too, just less severely. At 375px width, `Landing.tsx`'s header row (brand title + language switcher + accessibility control + Sign in/Get started) doesn't wrap or stack — the brand title ("Disaster Aid — Sri Lanka") breaks one word per line, pushing the layout down awkwardly, and in Tamil the longer button labels ("தொடங்குங்கள்") get visually cramped/cut off. This is a real, reproducible layout bug, not a one-off — screenshotted in both languages.

**Not fixed in this pass** — the user mentioned further UI changes are planned, and a header restructure is exactly the kind of change that could be superseded by that work. Flagging it here rather than fixing blind.

## G. Security testing

| Check | Result |
|---|---|
| `confirmToken` stripped from the victim's own `GET /api/deliveries/by-request/:id` | PASS — confirmed absent in the real response |
| `confirmToken` present in the donor's `GET /api/deliveries/by-donation/:id` (needed for QR generation) | PASS — confirmed present |
| QR confirm endpoint rejects a wrong/garbage token | PASS — 403, clear error message |
| QR confirm endpoint accepts the real token | PASS — 200, delivery → "confirmed", request → "delivered" |
| XSS: `<script>alert('xss-test')</script>` submitted as a delivery chat message | PASS — rendered as literal text, no script execution, no alert dialog |
| `GET /api/stats` (public) contains no NIC/home-address/victim-name | PASS |
| `GET /api/stats/by-area` (public) contains no NIC/home-address/victim-name — only district-level aggregates and district centroids | PASS |
| `GET /api/active-districts` (public) contains no PII | PASS |
| Victim's real NIC does not appear anywhere in the rendered `/admin/requests` list view | PASS |

---

## Not covered in this pass (out of scope or already covered elsewhere)

- Full keyboard-only navigation audit — not attempted this pass, worth a dedicated check later.
- Cross-browser (real Firefox/Edge, not just Chromium) — not attempted this pass.
- Firestore security rules — already covered exhaustively in a separate pass (`firestore-rules-test-report.md`).
- API role-gating/input-validation — already covered exhaustively in a separate pass (`api-integration-test-report.md`).
- ML model validation — already covered in `ml-evaluation-report.md`.
- Mobile app (Expo/React Native) — separate platform, not exercised in this browser-based pass.

---

*All four test accounts (`e2e-victim`, `e2e-donor`, `e2e-volunteer`, `e2e-admin@example.com`) and every document they created (requests, donations, deliveries, SOS reports, community reports, chats) were deleted after this run.*
