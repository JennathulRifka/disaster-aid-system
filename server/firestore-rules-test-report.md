# Firestore Security Rules Test Results

Generated: 2026-09-29T11:52:32.272Z
Method: direct Firestore REST API calls (bypassing the Express API and the Admin SDK entirely) with real Firebase ID tokens for real throwaway accounts, against `firestore-rules/firestore.rules` as actually deployed — not a reading of the rules file, a test of what Firestore itself currently enforces.

## Summary

**45/45 checks passed**

Covers every collection with a rule block: `users`, `aidRequests`, `donations`, `deliveries`, `sosRequests`, `caseNotes`, `broadcasts`, `activeDistricts`, `categoryLimits`, `deliveryChats`, `chatMessages`.

## Results

| # | Check | Expected | Actual (HTTP) | Result |
|---|---|---|---|---|
| 1 | owner reads own profile | allow | 200 | PASS |
| 2 | non-owner reads another user's profile | deny | 403 | PASS |
| 3 | admin reads another user's profile directly (NOT via the Express API) | deny | 403 | PASS |
| 4 | unauthenticated read of a profile | deny | 403 | PASS |
| 5 | owner can write own profile | allow | 200 | PASS |
| 6 | non-owner cannot write another user's profile | deny | 403 | PASS |
| 7 | owning victim reads own request | allow | 200 | PASS |
| 8 | a different, unrelated victim reads someone else's request | deny | 403 | PASS |
| 9 | donor reads a request that isn't theirs | deny | 403 | PASS |
| 10 | admin reads any request | allow | 200 | PASS |
| 11 | non-admin cannot write a request directly | deny | 403 | PASS |
| 12 | admin can write a request directly | allow | 200 | PASS |
| 13 | owning donor reads own donation | allow | 200 | PASS |
| 14 | unrelated volunteer reads someone else's donation | deny | 403 | PASS |
| 15 | admin reads any donation | allow | 200 | PASS |
| 16 | non-admin cannot write a donation directly | deny | 403 | PASS |
| 17 | assigned volunteer reads own delivery | allow | 200 | PASS |
| 18 | the owning donor (via the linked donation) reads the delivery | allow | 200 | PASS |
| 19 | admin reads any delivery | allow | 200 | PASS |
| 20 | the request's own victim (via the linked requestId) reads the delivery | allow | 200 | PASS |
| 21 | a completely unrelated victim (not the actual request's victim) can no longer read this delivery | deny | 403 | PASS |
| 22 | an unrelated volunteer (not assigned, not the owning donor) cannot read this delivery | deny | 403 | PASS |
| 23 | reporter reads own SOS report | allow | 200 | PASS |
| 24 | unrelated user cannot read someone else's SOS report | deny | 403 | PASS |
| 25 | admin reads any SOS report | allow | 200 | PASS |
| 26 | non-admin cannot update an SOS report's status directly | deny | 403 | PASS |
| 27 | admin reads a case note | allow | 200 | PASS |
| 28 | non-admin (even the request's own victim) cannot read a case note | deny | 403 | PASS |
| 29 | non-admin cannot write a case note directly | deny | 403 | PASS |
| 30 | unauthenticated user reads the active broadcast | allow | 200 | PASS |
| 31 | non-admin cannot post/edit a broadcast directly | deny | 403 | PASS |
| 32 | admin can write a broadcast directly | allow | 200 | PASS |
| 33 | unauthenticated user reads an active district | allow | 200 | PASS |
| 34 | non-admin cannot activate/deactivate a district directly | deny | 403 | PASS |
| 35 | any signed-in role reads a category limit | allow | 200 | PASS |
| 36 | unauthenticated user cannot read category limits | deny | 403 | PASS |
| 37 | a chat participant (donor) reads the chat | allow | 200 | PASS |
| 38 | the other chat participant (volunteer) reads the chat | allow | 200 | PASS |
| 39 | a non-participant cannot read the chat | deny | 403 | PASS |
| 40 | admin reads any chat | allow | 200 | PASS |
| 41 | even a participant cannot write to the chat doc directly | deny | 403 | PASS |
| 42 | even admin cannot write to the chat doc directly via REST | deny | 403 | PASS |
| 43 | a participant of the parent chat reads a message | allow | 200 | PASS |
| 44 | a non-participant cannot read a message | deny | 403 | PASS |
| 45 | no one can write a chat message directly via REST | deny | 403 | PASS |


## Notable findings (behavior confirmed as designed, worth knowing about)

- **admin reads another user's profile directly (NOT via the Express API)**
  - by design: the rule grants owner-only read, no admin exception — admin access to other profiles goes through the Express API (GET /api/users/volunteers etc.), which uses the Admin SDK and bypasses rules entirely

- **the request's own victim (via the linked requestId) reads the delivery**
  - FIXED: isOwningVictim() now checks the delivery's requestId resolves to a request owned by the caller, the same get()-based technique isOwningDonor() already used — this is the positive case the fix is meant to keep working.

- **a completely unrelated victim (not the actual request's victim) can no longer read this delivery**
  - FIXED (previously a real finding): the rule used to be `userRole() in ["admin","victim"]`, a role check not an ownership check, letting ANY authenticated victim account read ANY delivery document. Replaced with isOwningVictim() — confirmed here that an unrelated victim is now correctly denied.

- **even admin cannot write to the chat doc directly via REST**
  - by design: `allow write: if false` applies unconditionally — all chat writes must go through the chats API (server/src/routes/chats.js) so business rules (locked chats, mutual consent) stay in one place; the Admin SDK bypasses this rule for the API's own writes, but a direct client REST call from any role, including admin, is correctly blocked

---
*All test accounts and documents created during this run were deleted afterward.*
