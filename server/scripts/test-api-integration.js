/**
 * Systematic API integration testing — the gap flagged directly to the
 * user: almost every endpoint in this project has only ever been
 * happy-path tested during feature-building, never checked for correct
 * role-gating (403), auth-required (401), or bad-input (400) rejection in
 * one consolidated, repeatable pass.
 *
 * Same technique as load-test.js: real throwaway Firebase accounts per
 * role, real ID tokens via the Identity Toolkit REST API, real HTTP calls
 * against the actual running Express server (must be running on
 * http://localhost:5000 — this hits the live app, it is not mocked).
 * Every check is recorded (expected vs. actual status) into a report
 * written to server/api-integration-test-report.md/.json, then every
 * trace of the test accounts/data is deleted.
 *
 * Run: node scripts/test-api-integration.js  (server must already be running)
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { db, auth } = require("../src/config/firebase");

const API_BASE = "http://localhost:5000";
const FIREBASE_API_KEY = "AIzaSyCFeOCGBgocBZ7ZBu7lfdjdc-zhKHSZ8p4";
const TEST_PREFIX = "apitest";
const RUN_ID = Date.now();

const createdUids = [];
const createdDocs = []; // { collection, id }
const results = [];

function email(role) {
  return `${TEST_PREFIX}-${RUN_ID}-${role}@example.com`;
}

async function createAccount(role, extra = {}) {
  const userEmail = email(role);
  const password = "TestPass123!";
  const userRecord = await auth.createUser({ email: userEmail, password });
  createdUids.push(userRecord.uid);

  const profile = {
    uid: userRecord.uid,
    email: userEmail,
    role,
    name: `${TEST_PREFIX} ${role}`,
    phone: null,
    location: extra.location || null,
    nic: role === "victim" ? `APITEST${RUN_ID}` : null,
    homeAddress: role === "victim" ? `API Test Address` : null,
    createdAt: new Date().toISOString(),
    ...extra.profileOverrides,
  };
  if (role === "volunteer") profile.available = true;
  await db.collection("users").doc(userRecord.uid).set(profile, { merge: true });

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

async function apiCall(path, token, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

/** Records one check's result. `expected` may be a single status or an array of acceptable statuses. */
function record(name, expected, actual, extra = {}) {
  const expectedList = Array.isArray(expected) ? expected : [expected];
  const pass = expectedList.includes(actual);
  results.push({ name, expected: expectedList, actual, pass, ...extra });
  console.log(`   ${pass ? "PASS" : "FAIL"}: ${name} (expected ${expectedList.join("/")}, got ${actual})`);
}

async function main() {
  console.log("=== API Integration Test Suite ===\n");
  console.log("Creating test accounts (admin, donor, volunteer, victim)...");

  const admin1 = await createAccount("admin");
  const donor1 = await createAccount("donor");
  const volunteer1 = await createAccount("volunteer", { location: { lat: 6.9271, lng: 79.8612 } });
  const victim1 = await createAccount("victim");

  console.log("Accounts ready.\n");

  // ---- users.js ----
  console.log("1. users.js");
  {
    const r = await apiCall("/api/users/me", null);
    record("GET /api/users/me — no token rejected", 401, r.status);
  }
  {
    const r = await apiCall("/api/users/me", victim1.token);
    record("GET /api/users/me — happy path", 200, r.status);
  }
  {
    const r = await apiCall("/api/users/volunteers", donor1.token);
    record("GET /api/users/volunteers — non-admin rejected", 403, r.status);
  }
  {
    const r = await apiCall("/api/users/volunteers", admin1.token);
    record("GET /api/users/volunteers — admin happy path", 200, r.status);
  }
  {
    const r = await apiCall("/api/users/availability", donor1.token, {
      method: "PATCH",
      body: JSON.stringify({ available: true }),
    });
    record("PATCH /api/users/availability — non-volunteer rejected", 403, r.status);
  }
  {
    const r = await apiCall("/api/users/profile", victim1.token, {
      method: "POST",
      body: JSON.stringify({ name: "x", role: "victim" }), // missing nic/homeAddress
    });
    record("POST /api/users/profile — victim missing nic/homeAddress rejected", 400, r.status);
  }

  // ---- requests.js ----
  console.log("\n2. requests.js");
  {
    const r = await apiCall("/api/requests", donor1.token, {
      method: "POST",
      body: JSON.stringify({ items: [{ category: "food", quantity: 1 }] }),
    });
    record("POST /api/requests — non-victim rejected", 403, r.status);
  }
  {
    const r = await apiCall("/api/requests", victim1.token, {
      method: "POST",
      body: JSON.stringify({}), // missing items/location/etc
    });
    record("POST /api/requests — missing required fields rejected", 400, r.status);
  }
  let testRequestId;
  {
    const r = await apiCall("/api/requests", victim1.token, {
      method: "POST",
      body: JSON.stringify({
        disasterType: "flood",
        items: [{ category: "food", quantity: 1, unit: "pack" }],
        severity: "medium",
        peopleAffected: 2,
        vulnerableGroups: [],
        location: { lat: 6.9271, lng: 79.8612 },
        notes: "api-integration-test",
      }),
    });
    record("POST /api/requests — victim happy path", 201, r.status);
    testRequestId = r.body?.id || r.body?.requestId || null;
    if (testRequestId) createdDocs.push({ collection: "aidRequests", id: testRequestId });
  }
  {
    const r = await apiCall("/api/requests", donor1.token);
    record("GET /api/requests — non-admin rejected", 403, r.status);
  }
  {
    const r = await apiCall("/api/requests", null);
    record("GET /api/requests — no token rejected", 401, r.status);
  }
  {
    const r = await apiCall("/api/requests/mine", victim1.token);
    record("GET /api/requests/mine — victim happy path", 200, r.status);
  }
  {
    const r = await apiCall(`/api/requests/${testRequestId || "nonexistent"}/verify`, donor1.token, {
      method: "PATCH",
      body: JSON.stringify({ approve: true }),
    });
    record("PATCH /api/requests/:id/verify — non-admin rejected", 403, r.status);
  }

  // ---- donations.js ----
  console.log("\n3. donations.js");
  {
    const r = await apiCall("/api/donations", victim1.token, {
      method: "POST",
      body: JSON.stringify({ category: "food", quantity: "1", deliveryMethod: "self" }),
    });
    record("POST /api/donations — non-donor rejected", 403, r.status);
  }
  let testDonationId;
  {
    const r = await apiCall("/api/donations", donor1.token, {
      method: "POST",
      body: JSON.stringify({
        category: "food",
        quantity: "1 pack",
        quantityValue: 1,
        deliveryMethod: "self",
        location: { lat: 6.9271, lng: 79.8612 },
      }),
    });
    record("POST /api/donations — donor happy path", 201, r.status);
    testDonationId = r.body?.id || r.body?.donationId || null;
    if (testDonationId) createdDocs.push({ collection: "donations", id: testDonationId });
  }
  {
    const r = await apiCall("/api/donations", volunteer1.token);
    record("GET /api/donations — non-admin rejected", 403, r.status);
  }
  {
    const r = await apiCall("/api/donations/mine", donor1.token);
    record("GET /api/donations/mine — donor happy path", 200, r.status);
  }

  // ---- deliveries.js ----
  console.log("\n4. deliveries.js");
  {
    const r = await apiCall("/api/deliveries", donor1.token, {
      method: "POST",
      body: JSON.stringify({ donationId: testDonationId || "x", volunteerId: volunteer1.uid }),
    });
    record("POST /api/deliveries — non-admin rejected", 403, r.status);
  }
  {
    const r = await apiCall("/api/deliveries/mine", donor1.token);
    record("GET /api/deliveries/mine — non-volunteer rejected", 403, r.status);
  }
  {
    const r = await apiCall("/api/deliveries/mine", volunteer1.token);
    record("GET /api/deliveries/mine — volunteer happy path", 200, r.status);
  }
  {
    const r = await apiCall(`/api/deliveries/by-request/${testRequestId || "nonexistent"}`, victim1.token);
    record("GET /api/deliveries/by-request/:id — victim happy path (own request)", 200, r.status);
  }

  // ---- stats.js (public) ----
  console.log("\n5. stats.js");
  {
    const r = await apiCall("/api/stats", null);
    record("GET /api/stats — public, no token needed", 200, r.status);
  }
  {
    const r = await apiCall("/api/stats/by-area", null);
    record("GET /api/stats/by-area — public, no token needed", 200, r.status);
  }

  // ---- external.js ----
  console.log("\n6. external.js");
  {
    const r = await apiCall("/api/external/alerts", null);
    record("GET /api/external/alerts — public", 200, r.status);
  }
  {
    const r = await apiCall("/api/external/weather", null);
    record("GET /api/external/weather — public", 200, r.status);
  }
  {
    const r = await apiCall("/api/external/flood-risk/retrain", null, { method: "POST" });
    record("POST /api/external/flood-risk/retrain — no token rejected", 401, r.status);
  }
  {
    const r = await apiCall("/api/external/flood-risk/retrain", donor1.token, { method: "POST" });
    record("POST /api/external/flood-risk/retrain — non-admin rejected", 403, r.status);
  }

  // ---- categories.js ----
  console.log("\n7. categories.js");
  {
    const r = await apiCall("/api/categories", null);
    record("GET /api/categories — no token rejected", 401, r.status);
  }
  {
    const r = await apiCall("/api/categories", victim1.token);
    record("GET /api/categories — any authed role happy path", 200, r.status);
  }
  {
    const r = await apiCall("/api/categories", donor1.token, {
      method: "POST",
      body: JSON.stringify({ label: "Test", unit: "unit", max: 5 }),
    });
    record("POST /api/categories — non-admin rejected", 403, r.status);
  }

  // ---- broadcasts.js ----
  console.log("\n8. broadcasts.js");
  {
    const r = await apiCall("/api/broadcasts/active", null);
    record("GET /api/broadcasts/active — public", 200, r.status);
  }
  {
    const r = await apiCall("/api/broadcasts", donor1.token, {
      method: "POST",
      body: JSON.stringify({ message: "test", severity: "info" }),
    });
    record("POST /api/broadcasts — non-admin rejected", 403, r.status);
  }

  // ---- auditLog.js ----
  console.log("\n9. auditLog.js");
  {
    const r = await apiCall("/api/audit-log", donor1.token);
    record("GET /api/audit-log — non-admin rejected", 403, r.status);
  }
  {
    const r = await apiCall("/api/audit-log", admin1.token);
    record("GET /api/audit-log — admin happy path", 200, r.status);
  }

  // ---- activeDistricts.js ----
  console.log("\n10. activeDistricts.js");
  {
    const r = await apiCall("/api/active-districts", null);
    record("GET /api/active-districts — public", 200, r.status);
  }
  {
    const r = await apiCall("/api/active-districts", donor1.token, {
      method: "POST",
      body: JSON.stringify({ district: "Colombo" }),
    });
    record("POST /api/active-districts — non-admin rejected", 403, r.status);
  }
  {
    const r = await apiCall("/api/active-districts", admin1.token, {
      method: "POST",
      body: JSON.stringify({ district: "Not A Real District" }),
    });
    record("POST /api/active-districts — invalid district name rejected", 400, r.status);
  }

  // ---- waterAlerts.js ----
  console.log("\n11. waterAlerts.js");
  {
    const r = await apiCall("/api/water-alerts/settings", donor1.token);
    record("GET /api/water-alerts/settings — non-admin rejected", 403, r.status);
  }
  {
    const r = await apiCall("/api/water-alerts/settings", admin1.token);
    record("GET /api/water-alerts/settings — admin happy path", 200, r.status);
  }

  // ---- sos.js ----
  console.log("\n12. sos.js");
  {
    const r = await apiCall("/api/sos", null, { method: "POST", body: JSON.stringify({ type: "trapped", location: { lat: 1, lng: 1 } }) });
    record("POST /api/sos — no token rejected", 401, r.status);
  }
  {
    const r = await apiCall("/api/sos", victim1.token, { method: "POST", body: JSON.stringify({}) });
    record("POST /api/sos — missing type/location rejected", 400, r.status);
  }
  let testSosId;
  {
    const r = await apiCall("/api/sos", victim1.token, {
      method: "POST",
      body: JSON.stringify({ type: "trapped", location: { lat: 6.9271, lng: 79.8612 } }),
    });
    record("POST /api/sos — happy path (any authed role)", 201, r.status);
    testSosId = r.body?.id || null;
    if (testSosId) createdDocs.push({ collection: "sosRequests", id: testSosId });
  }
  {
    const r = await apiCall(`/api/sos/${testSosId || "nonexistent"}/status`, victim1.token, {
      method: "PATCH",
      body: JSON.stringify({ status: "acknowledged" }),
    });
    record("PATCH /api/sos/:id/status — non-admin rejected", 403, r.status);
  }

  // ---- communityReports.js ----
  console.log("\n13. communityReports.js");
  {
    const r = await apiCall("/api/community-reports", donor1.token, {
      method: "POST",
      body: JSON.stringify({ type: "road_closure", description: "test", location: { lat: 1, lng: 1 } }),
    });
    record("POST /api/community-reports — non-volunteer rejected", 403, r.status);
  }
  {
    const r = await apiCall("/api/community-reports", donor1.token);
    record("GET /api/community-reports — non-admin rejected", 403, r.status);
  }
  {
    const r = await apiCall("/api/community-reports/verified", null);
    record("GET /api/community-reports/verified — public", 200, r.status);
  }

  // ---- chats.js ----
  console.log("\n14. chats.js");
  {
    const r = await apiCall("/api/chats/mine", null);
    record("GET /api/chats/mine — no token rejected", 401, r.status);
  }
  {
    const r = await apiCall("/api/chats/mine", victim1.token);
    record("GET /api/chats/mine — happy path", 200, r.status);
  }

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
    failed.forEach((f) => console.log(`  - ${f.name}: expected ${f.expected.join("/")}, got ${f.actual}`));
  }

  const generatedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(__dirname, "../api-integration-test-report.json"),
    JSON.stringify({ generatedAt, total: results.length, passed, failed: failed.length, results }, null, 2)
  );

  const md = `# API Integration Test Results

Generated: ${generatedAt}
Server: ${API_BASE} (live, real HTTP calls — not mocked)

## Summary

**${passed}/${results.length} checks passed**${failed.length > 0 ? ` (${failed.length} failed — see below)` : ""}

Covers every route file in \`server/src/routes/\`: happy-path success, wrong-role rejection (403), missing-auth rejection (401), and invalid-input rejection (400), using real throwaway Firebase accounts (admin/donor/volunteer/victim) and real ID tokens — not mocked requests.

## Results

| # | Check | Expected | Actual | Result |
|---|---|---|---|---|
${results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.expected.join(" or ")} | ${r.actual} | ${r.pass ? "PASS" : "**FAIL**"} |`).join("\n")}

${failed.length > 0 ? `## Failures\n\n${failed.map((f) => `- **${f.name}**: expected ${f.expected.join("/")}, got ${f.actual}`).join("\n")}\n` : ""}
---
*All test accounts and data created during this run were deleted afterward.*
`;
  fs.writeFileSync(path.join(__dirname, "../api-integration-test-report.md"), md);
  console.log("Reports written: server/api-integration-test-report.md / .json");
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("Test run failed:", err);
    // Best-effort cleanup even on failure.
    try {
      await Promise.all(createdDocs.map((d) => db.collection(d.collection).doc(d.id).delete().catch(() => {})));
      await Promise.all(createdUids.map((uid) => db.collection("users").doc(uid).delete().catch(() => {})));
      if (createdUids.length) await auth.deleteUsers(createdUids);
    } catch {
      // ignore cleanup errors on an already-failed run
    }
    process.exit(1);
  });
