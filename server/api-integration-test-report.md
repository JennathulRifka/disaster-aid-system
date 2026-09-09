# API Integration Test Results

Generated: 2026-09-03T11:20:30.072Z
Server: http://localhost:5000 (live, real HTTP calls — not mocked)

## Summary

**48/48 checks passed**

Covers every route file in `server/src/routes/`: happy-path success, wrong-role rejection (403), missing-auth rejection (401), and invalid-input rejection (400), using real throwaway Firebase accounts (admin/donor/volunteer/victim) and real ID tokens — not mocked requests.

## Results

| # | Check | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | GET /api/users/me — no token rejected | 401 | 401 | PASS |
| 2 | GET /api/users/me — happy path | 200 | 200 | PASS |
| 3 | GET /api/users/volunteers — non-admin rejected | 403 | 403 | PASS |
| 4 | GET /api/users/volunteers — admin happy path | 200 | 200 | PASS |
| 5 | PATCH /api/users/availability — non-volunteer rejected | 403 | 403 | PASS |
| 6 | POST /api/users/profile — victim missing nic/homeAddress rejected | 400 | 400 | PASS |
| 7 | POST /api/requests — non-victim rejected | 403 | 403 | PASS |
| 8 | POST /api/requests — missing required fields rejected | 400 | 400 | PASS |
| 9 | POST /api/requests — victim happy path | 201 | 201 | PASS |
| 10 | GET /api/requests — non-admin rejected | 403 | 403 | PASS |
| 11 | GET /api/requests — no token rejected | 401 | 401 | PASS |
| 12 | GET /api/requests/mine — victim happy path | 200 | 200 | PASS |
| 13 | PATCH /api/requests/:id/verify — non-admin rejected | 403 | 403 | PASS |
| 14 | POST /api/donations — non-donor rejected | 403 | 403 | PASS |
| 15 | POST /api/donations — donor happy path | 201 | 201 | PASS |
| 16 | GET /api/donations — non-admin rejected | 403 | 403 | PASS |
| 17 | GET /api/donations/mine — donor happy path | 200 | 200 | PASS |
| 18 | POST /api/deliveries — non-admin rejected | 403 | 403 | PASS |
| 19 | GET /api/deliveries/mine — non-volunteer rejected | 403 | 403 | PASS |
| 20 | GET /api/deliveries/mine — volunteer happy path | 200 | 200 | PASS |
| 21 | GET /api/deliveries/by-request/:id — victim happy path (own request) | 200 | 200 | PASS |
| 22 | GET /api/stats — public, no token needed | 200 | 200 | PASS |
| 23 | GET /api/stats/by-area — public, no token needed | 200 | 200 | PASS |
| 24 | GET /api/external/alerts — public | 200 | 200 | PASS |
| 25 | GET /api/external/weather — public | 200 | 200 | PASS |
| 26 | POST /api/external/flood-risk/retrain — no token rejected | 401 | 401 | PASS |
| 27 | POST /api/external/flood-risk/retrain — non-admin rejected | 403 | 403 | PASS |
| 28 | GET /api/categories — no token rejected | 401 | 401 | PASS |
| 29 | GET /api/categories — any authed role happy path | 200 | 200 | PASS |
| 30 | POST /api/categories — non-admin rejected | 403 | 403 | PASS |
| 31 | GET /api/broadcasts/active — public | 200 | 200 | PASS |
| 32 | POST /api/broadcasts — non-admin rejected | 403 | 403 | PASS |
| 33 | GET /api/audit-log — non-admin rejected | 403 | 403 | PASS |
| 34 | GET /api/audit-log — admin happy path | 200 | 200 | PASS |
| 35 | GET /api/active-districts — public | 200 | 200 | PASS |
| 36 | POST /api/active-districts — non-admin rejected | 403 | 403 | PASS |
| 37 | POST /api/active-districts — invalid district name rejected | 400 | 400 | PASS |
| 38 | GET /api/water-alerts/settings — non-admin rejected | 403 | 403 | PASS |
| 39 | GET /api/water-alerts/settings — admin happy path | 200 | 200 | PASS |
| 40 | POST /api/sos — no token rejected | 401 | 401 | PASS |
| 41 | POST /api/sos — missing type/location rejected | 400 | 400 | PASS |
| 42 | POST /api/sos — happy path (any authed role) | 201 | 201 | PASS |
| 43 | PATCH /api/sos/:id/status — non-admin rejected | 403 | 403 | PASS |
| 44 | POST /api/community-reports — non-volunteer rejected | 403 | 403 | PASS |
| 45 | GET /api/community-reports — non-admin rejected | 403 | 403 | PASS |
| 46 | GET /api/community-reports/verified — public | 200 | 200 | PASS |
| 47 | GET /api/chats/mine — no token rejected | 401 | 401 | PASS |
| 48 | GET /api/chats/mine — happy path | 200 | 200 | PASS |


---
*All test accounts and data created during this run were deleted afterward.*
