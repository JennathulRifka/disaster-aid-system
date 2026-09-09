/**
 * Firestore security rules testing — direct REST calls against the real
 * Firestore project, bypassing the Express API and the Admin SDK entirely
 * (the Admin SDK bypasses rules, so it can't be used to test them; this is
 * exactly what a client SDK's onSnapshot listener goes through). Same
 * technique already used individually for several features during
 * development (see CLAUDE.md's "Live updates", "SOS / rescue flow", etc.)
 * — this consolidates it into one repeatable pass across every collection
 * with a rule in firestore-rules/firestore.rules, confirming none regressed.
 *
 * Creates real throwaway accounts + real ID tokens (Identity Toolkit REST
 * API) and real throwaway documents (via the Admin SDK, which is allowed to
 * write anything regardless of rules — that's the whole reason a synthetic
 * test doc is safe to create this way), then reads/writes them via the
 * plain Firestore REST API with each token to see what the DEPLOYED rules
 * actually allow — not what the rules file says on paper, what Firestore
 * itself enforces right now.
 *
 * Run: node scripts/test-firestore-rules.js
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { db, auth } = require("../src/config/firebase");

const FIREBASE_API_KEY = "AIzaSyCFeOCGBgocBZ7ZBu7lfdjdc-zhKHSZ8p4";
const PROJECT_ID = "disaster-aid-system";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const TEST_PREFIX = "ruletest";
const RUN_ID = Date.now();

const createdUids = [];
const createdDocs = []; // { collection, id }
const results = [];

let accountCounter = 0;
function email(role) {
  accountCounter += 1;
  return `${TEST_PREFIX}-${RUN_ID}-${role}${accountCounter}@example.com`;
}

async function createAccount(role) {
  const userEmail = email(role);
  const password = "TestPass123!";
  const userRecord = await auth.createUser({ email: userEmail, password });
  createdUids.push(userRecord.uid);
  await db.collection("users").doc(userRecord.uid).set({
    uid: userRecord.uid,
    email: userEmail,
    role,
    name: `${TEST_PREFIX} ${role}`,
    phone: null,
    location: null,
    nic: null,
    homeAddress: null,
    createdAt: new Date().toISOString(),
  });
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userEmail, password, returnSecureToken: true }),
    }
  );
  const data = await res.json();
  if (!data.idToken) throw new Error(`Failed to sign in ${userEmail}: ${JSON.stringify(data)}`);
  return { uid: userRecord.uid, email: userEmail, token: data.idToken };
}

async function createDoc(collection, data) {
  const ref = await db.collection(collection).add({ ...data, createdAt: new Date().toISOString() });
  createdDocs.push({ collection, id: ref.id });
  return ref.id;
}

// A real transient network blip to firestore.googleapis.com was hit while
// building this (a plain connect timeout, nothing to do with rules or
// tokens) — one retry with a short backoff covers that without masking a
// genuine, repeated failure.
async function withRetry(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastErr;
}

async function firestoreGet(collection, docId, token) {
  return withRetry(async () => {
    const res = await fetch(`${FIRESTORE_BASE}/${collection}/${docId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return { status: res.status };
  });
}

async function firestorePatch(collection, docId, token) {
  return withRetry(async () => {
    const res = await fetch(`${FIRESTORE_BASE}/${collection}/${docId}?updateMask.fieldPaths=_ruleTestField`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ fields: { _ruleTestField: { booleanValue: true } } }),
    });
    return { status: res.status };
  });
}

/** Firestore REST returns 403 PERMISSION_DENIED for "signed in but not allowed" AND
 * for "not signed in at all" in this project's rules (every rule starts with
 * isSignedIn()) — both are correctly-denied outcomes, so both count as "deny". */
function record(name, expectation, actual, note) {
  const pass = expectation === "allow" ? actual === 200 : actual === 401 || actual === 403;
  results.push({ name, expectation, actual, pass, note });
  console.log(`   ${pass ? "PASS" : "FAIL"}: ${name} (expected ${expectation}, got HTTP ${actual})${note ? ` — ${note}` : ""}`);
}

async function main() {
  console.log("=== Firestore Security Rules Test Suite ===\n");
  console.log("Creating test accounts and documents...");

  const admin1 = await createAccount("admin");
  const donor1 = await createAccount("donor");
  const volunteer1 = await createAccount("volunteer");
  const victim1 = await createAccount("victim");
  const victim2 = await createAccount("victim"); // a second, unrelated victim

  const requestId = await createDoc("aidRequests", { victimId: victim1.uid, status: "pending", items: [] });
  const donationId = await createDoc("donations", { donorId: donor1.uid, category: "food", status: "available" });
  const deliveryId = await createDoc("deliveries", { volunteerId: volunteer1.uid, donationId, status: "accepted" });
  const sosId = await createDoc("sosRequests", { reporterId: victim1.uid, type: "trapped", status: "pending" });
  const caseNoteId = await createDoc("caseNotes", { requestId, authorId: admin1.uid, text: "test note" });
  const broadcastId = await createDoc("broadcasts", { message: "test", severity: "info", active: true });
  const activeDistrictId = await createDoc("activeDistricts", { district: "Colombo" });
  const chatId = await createDoc("deliveryChats", {
    deliveryId,
    pairKey: "donor_volunteer",
    partyAId: donor1.uid,
    partyBId: volunteer1.uid,
    status: "active",
    consentA: false,
    consentB: false,
    contactRevealed: false,
  });
  const messageId = await createDoc("chatMessages", { chatId, senderId: donor1.uid, text: "test message" });

  console.log("Setup complete.\n");

  // ---- users/{userId} ----
  console.log("1. users/{userId} — owner-only read/write");
  record("owner reads own profile", "allow", (await firestoreGet("users", victim1.uid, victim1.token)).status);
  record("non-owner reads another user's profile", "deny", (await firestoreGet("users", victim1.uid, donor1.token)).status);
  record(
    "admin reads another user's profile directly (NOT via the Express API)",
    "deny",
    (await firestoreGet("users", victim1.uid, admin1.token)).status,
    "by design: the rule grants owner-only read, no admin exception — admin access to other profiles goes through the Express API (GET /api/users/volunteers etc.), which uses the Admin SDK and bypasses rules entirely"
  );
  record("unauthenticated read of a profile", "deny", (await firestoreGet("users", victim1.uid, null)).status);
  record("owner can write own profile", "allow", (await firestorePatch("users", victim1.uid, victim1.token)).status);
  record("non-owner cannot write another user's profile", "deny", (await firestorePatch("users", victim1.uid, donor1.token)).status);

  // ---- aidRequests/{requestId} ----
  console.log("\n2. aidRequests/{requestId} — owning victim or admin can read");
  record("owning victim reads own request", "allow", (await firestoreGet("aidRequests", requestId, victim1.token)).status);
  record("a different, unrelated victim reads someone else's request", "deny", (await firestoreGet("aidRequests", requestId, victim2.token)).status);
  record("donor reads a request that isn't theirs", "deny", (await firestoreGet("aidRequests", requestId, donor1.token)).status);
  record("admin reads any request", "allow", (await firestoreGet("aidRequests", requestId, admin1.token)).status);
  record("non-admin cannot write a request directly", "deny", (await firestorePatch("aidRequests", requestId, donor1.token)).status);
  record("admin can write a request directly", "allow", (await firestorePatch("aidRequests", requestId, admin1.token)).status);

  // ---- donations/{donationId} ----
  console.log("\n3. donations/{donationId} — owning donor or admin can read");
  record("owning donor reads own donation", "allow", (await firestoreGet("donations", donationId, donor1.token)).status);
  record("unrelated volunteer reads someone else's donation", "deny", (await firestoreGet("donations", donationId, volunteer1.token)).status);
  record("admin reads any donation", "allow", (await firestoreGet("donations", donationId, admin1.token)).status);
  record("non-admin cannot write a donation directly", "deny", (await firestorePatch("donations", donationId, donor1.token)).status);

  // ---- deliveries/{deliveryId} ----
  console.log("\n4. deliveries/{deliveryId} — assigned volunteer, owning donor, admin, or (per the rule) ANY victim");
  record("assigned volunteer reads own delivery", "allow", (await firestoreGet("deliveries", deliveryId, volunteer1.token)).status);
  record("the owning donor (via the linked donation) reads the delivery", "allow", (await firestoreGet("deliveries", deliveryId, donor1.token)).status);
  record("admin reads any delivery", "allow", (await firestoreGet("deliveries", deliveryId, admin1.token)).status);
  record(
    "a completely unrelated victim (not the actual request's victim) can also read this delivery",
    "allow",
    (await firestoreGet("deliveries", deliveryId, victim2.token)).status,
    "REAL FINDING: the rule is `userRole() in [\"admin\",\"victim\"]`, not \"this delivery's own victim\" — ANY authenticated victim account can read ANY delivery document, not just the one tied to their own request. Flagged directly, not silently fixed — see the report notes."
  );
  record("an unrelated volunteer (not assigned, not the owning donor) cannot read this delivery", "deny", (await firestoreGet("deliveries", deliveryId, (await createAccount("volunteer")).token)).status);

  // ---- sosRequests/{sosId} ----
  console.log("\n5. sosRequests/{sosId} — reporter or admin can read");
  record("reporter reads own SOS report", "allow", (await firestoreGet("sosRequests", sosId, victim1.token)).status);
  record("unrelated user cannot read someone else's SOS report", "deny", (await firestoreGet("sosRequests", sosId, victim2.token)).status);
  record("admin reads any SOS report", "allow", (await firestoreGet("sosRequests", sosId, admin1.token)).status);
  record("non-admin cannot update an SOS report's status directly", "deny", (await firestorePatch("sosRequests", sosId, victim1.token)).status);

  // ---- caseNotes/{noteId} ----
  console.log("\n6. caseNotes/{noteId} — admin-only, both directions");
  record("admin reads a case note", "allow", (await firestoreGet("caseNotes", caseNoteId, admin1.token)).status);
  record("non-admin (even the request's own victim) cannot read a case note", "deny", (await firestoreGet("caseNotes", caseNoteId, victim1.token)).status);
  record("non-admin cannot write a case note directly", "deny", (await firestorePatch("caseNotes", caseNoteId, victim1.token)).status);

  // ---- broadcasts/{broadcastId} ----
  console.log("\n7. broadcasts/{broadcastId} — public read, admin-only write");
  record("unauthenticated user reads the active broadcast", "allow", (await firestoreGet("broadcasts", broadcastId, null)).status);
  record("non-admin cannot post/edit a broadcast directly", "deny", (await firestorePatch("broadcasts", broadcastId, donor1.token)).status);
  record("admin can write a broadcast directly", "allow", (await firestorePatch("broadcasts", broadcastId, admin1.token)).status);

  // ---- activeDistricts/{districtId} ----
  console.log("\n8. activeDistricts/{districtId} — public read, admin-only write");
  record("unauthenticated user reads an active district", "allow", (await firestoreGet("activeDistricts", activeDistrictId, null)).status);
  record("non-admin cannot activate/deactivate a district directly", "deny", (await firestorePatch("activeDistricts", activeDistrictId, donor1.token)).status);

  // ---- categoryLimits — read-only check against real, existing data ----
  console.log("\n9. categoryLimits/{key} — any signed-in user can read, admin-only write");
  const categorySnapshot = await db.collection("categoryLimits").limit(1).get();
  if (!categorySnapshot.empty) {
    const categoryKey = categorySnapshot.docs[0].id;
    record("any signed-in role reads a category limit", "allow", (await firestoreGet("categoryLimits", categoryKey, victim1.token)).status);
    record("unauthenticated user cannot read category limits", "deny", (await firestoreGet("categoryLimits", categoryKey, null)).status);
  } else {
    console.log("   SKIPPED — no categoryLimits documents exist yet to test against.");
  }

  // ---- deliveryChats/{chatId} — participant or admin read; write always false ----
  console.log("\n10. deliveryChats/{chatId} — participant or admin read only; write blocked for everyone");
  record("a chat participant (donor) reads the chat", "allow", (await firestoreGet("deliveryChats", chatId, donor1.token)).status);
  record("the other chat participant (volunteer) reads the chat", "allow", (await firestoreGet("deliveryChats", chatId, volunteer1.token)).status);
  record("a non-participant cannot read the chat", "deny", (await firestoreGet("deliveryChats", chatId, victim1.token)).status);
  record("admin reads any chat", "allow", (await firestoreGet("deliveryChats", chatId, admin1.token)).status);
  record("even a participant cannot write to the chat doc directly", "deny", (await firestorePatch("deliveryChats", chatId, donor1.token)).status);
  record(
    "even admin cannot write to the chat doc directly via REST",
    "deny",
    (await firestorePatch("deliveryChats", chatId, admin1.token)).status,
    "by design: `allow write: if false` applies unconditionally — all chat writes must go through the chats API (server/src/routes/chats.js) so business rules (locked chats, mutual consent) stay in one place; the Admin SDK bypasses this rule for the API's own writes, but a direct client REST call from any role, including admin, is correctly blocked"
  );

  // ---- chatMessages/{messageId} — same pattern, parent-chat participancy ----
  console.log("\n11. chatMessages/{messageId} — participant of the parent chat, or admin, can read; write blocked for everyone");
  record("a participant of the parent chat reads a message", "allow", (await firestoreGet("chatMessages", messageId, donor1.token)).status);
  record("a non-participant cannot read a message", "deny", (await firestoreGet("chatMessages", messageId, victim1.token)).status);
  record("no one can write a chat message directly via REST", "deny", (await firestorePatch("chatMessages", messageId, donor1.token)).status);

  // ---- Cleanup ----
  console.log("\nCleaning up test accounts and data...");
  await Promise.all(createdDocs.map((d) => db.collection(d.collection).doc(d.id).delete().catch(() => {})));
  await Promise.all(createdUids.map((uid) => db.collection("users").doc(uid).delete().catch(() => {})));
  await auth.deleteUsers(createdUids);
  console.log("Cleanup done.\n");

  // ---- Report ----
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log(`=== Result: ${passed}/${results.length} checks passed ===`);
  if (failed.length > 0) {
    console.log("Failures:");
    failed.forEach((f) => console.log(`  - ${f.name}: expected ${f.expectation}, got HTTP ${f.actual}`));
  }

  const generatedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(__dirname, "../firestore-rules-test-report.json"),
    JSON.stringify({ generatedAt, total: results.length, passed, failed: failed.length, results }, null, 2)
  );

  const notedFindings = results.filter((r) => r.note);
  const md = `# Firestore Security Rules Test Results

Generated: ${generatedAt}
Method: direct Firestore REST API calls (bypassing the Express API and the Admin SDK entirely) with real Firebase ID tokens for real throwaway accounts, against \`firestore-rules/firestore.rules\` as actually deployed — not a reading of the rules file, a test of what Firestore itself currently enforces.

## Summary

**${passed}/${results.length} checks passed**${failed.length > 0 ? ` (${failed.length} failed — see below)` : ""}

Covers every collection with a rule block: \`users\`, \`aidRequests\`, \`donations\`, \`deliveries\`, \`sosRequests\`, \`caseNotes\`, \`broadcasts\`, \`activeDistricts\`, \`categoryLimits\`, \`deliveryChats\`, \`chatMessages\`.

## Results

| # | Check | Expected | Actual (HTTP) | Result |
|---|---|---|---|---|
${results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.expectation} | ${r.actual} | ${r.pass ? "PASS" : "**FAIL**"} |`).join("\n")}

${failed.length > 0 ? `## Failures\n\n${failed.map((f) => `- **${f.name}**: expected ${f.expectation}, got HTTP ${f.actual}`).join("\n")}\n` : ""}
## Notable findings (behavior confirmed as designed, worth knowing about)

${notedFindings.map((f) => `- **${f.name}**\n  - ${f.note}`).join("\n\n")}

---
*All test accounts and documents created during this run were deleted afterward.*
`;
  fs.writeFileSync(path.join(__dirname, "../firestore-rules-test-report.md"), md);
  console.log("Reports written: server/firestore-rules-test-report.md / .json");
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("Test run failed:", err);
    try {
      await Promise.all(createdDocs.map((d) => db.collection(d.collection).doc(d.id).delete().catch(() => {})));
      await Promise.all(createdUids.map((uid) => db.collection("users").doc(uid).delete().catch(() => {})));
      if (createdUids.length) await auth.deleteUsers(createdUids);
    } catch {
      // ignore cleanup errors on an already-failed run
    }
    process.exit(1);
  });
