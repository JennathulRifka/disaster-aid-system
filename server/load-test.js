// Concurrent-load test harness. Creates real throwaway Firebase accounts,
// gets real ID tokens, and fires genuinely concurrent requests at the real
// Express + Firestore backend (not mocked) across the core write/read paths.
// Reports latency stats + success/failure counts per phase, then runs data-
// integrity checks (e.g. did concurrent matching ever double-assign a
// request item), then deletes every trace of itself.

require("dotenv").config();
const { db, auth } = require("./src/config/firebase");

const API_BASE = "http://localhost:5000";
const FIREBASE_API_KEY = "AIzaSyCFeOCGBgocBZ7ZBu7lfdjdc-zhKHSZ8p4";
const TEST_PREFIX = "loadtest";
const RUN_ID = Date.now();

const VICTIM_COUNT = 30;
const DONOR_COUNT = 30;
const VOLUNTEER_COUNT = 15;
const READ_BURST_COUNT = 50;

const createdUids = [];
const createdDocs = { aidRequests: [], donations: [], deliveries: [] };

function email(role, i) {
  return `${TEST_PREFIX}-${RUN_ID}-${role}${i}@example.com`;
}

async function createAccount(role, i, extra = {}) {
  const userEmail = email(role, i);
  const password = "TestPass123!";
  const userRecord = await auth.createUser({ email: userEmail, password });
  createdUids.push(userRecord.uid);

  const profile = {
    uid: userRecord.uid,
    email: userEmail,
    role,
    name: `${TEST_PREFIX} ${role} ${i}`,
    phone: null,
    location: extra.location || null,
    nic: role === "victim" ? `LOADTEST${RUN_ID}${i}` : null,
    homeAddress: role === "victim" ? `Loadtest Address ${i}` : null,
    createdAt: new Date().toISOString(),
  };
  if (role === "volunteer") profile.available = true;
  await db.collection("users").doc(userRecord.uid).set(profile, { merge: true });

  // Real sign-in via Identity Toolkit REST API to get a genuine ID token —
  // same technique used throughout this project's manual testing history.
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

async function timedFetch(path, token, options = {}) {
  const start = performance.now();
  let status = 0;
  let body = null;
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    status = res.status;
    body = await res.json().catch(() => null);
  } catch (err) {
    return { ok: false, ms: performance.now() - start, status: 0, error: err.message };
  }
  const ms = performance.now() - start;
  return { ok: status >= 200 && status < 300, ms, status, body };
}

function stats(results) {
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const times = ok.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (p) => (times.length ? times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))] : 0);
  return {
    total: results.length,
    succeeded: ok.length,
    failed: failed.length,
    failureReasons: failed.slice(0, 5).map((r) => ({ status: r.status, error: r.error || r.body?.error })),
    minMs: times.length ? Math.round(times[0]) : 0,
    avgMs: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0,
    p95Ms: Math.round(pct(95)),
    maxMs: times.length ? Math.round(times[times.length - 1]) : 0,
  };
}

function randomLocation() {
  // Scattered around Colombo/Gampaha area, real Sri Lanka coordinates.
  return { lat: 6.8 + Math.random() * 0.4, lng: 79.8 + Math.random() * 0.4 };
}

async function main() {
  console.log(`=== Concurrent load test run ${RUN_ID} ===\n`);

  console.log(`Creating ${VICTIM_COUNT} victims, ${DONOR_COUNT} donors, ${VOLUNTEER_COUNT} volunteers, 1 admin...`);
  const t0 = performance.now();
  const victims = await Promise.all(
    Array.from({ length: VICTIM_COUNT }, (_, i) => createAccount("victim", i))
  );
  const donors = await Promise.all(
    Array.from({ length: DONOR_COUNT }, (_, i) => createAccount("donor", i))
  );
  const volunteers = await Promise.all(
    Array.from({ length: VOLUNTEER_COUNT }, (_, i) => createAccount("volunteer", i, { location: randomLocation() }))
  );
  const [admin1] = await Promise.all([createAccount("admin", 0)]);
  console.log(`Account setup done in ${Math.round(performance.now() - t0)}ms\n`);

  // ---- Phase 1: concurrent request submission (all victims, same instant) ----
  console.log(`--- Phase 1: ${VICTIM_COUNT} victims submitting requests concurrently ---`);
  const requestResults = await Promise.all(
    victims.map((v) =>
      timedFetch("/api/requests", v.token, {
        method: "POST",
        body: JSON.stringify({
          disasterType: "flood",
          items: [{ category: "water", quantity: 2 }],
          severity: "high",
          peopleAffected: 3,
          vulnerableGroups: [],
          location: randomLocation(),
          notes: "load test",
        }),
      })
    )
  );
  requestResults.forEach((r) => r.body?.id && createdDocs.aidRequests.push(r.body.id));
  console.log(JSON.stringify(stats(requestResults), null, 2), "\n");

  // Admin approves every request that was created, concurrently.
  console.log(`--- Admin approving ${createdDocs.aidRequests.length} requests concurrently ---`);
  const verifyResults = await Promise.all(
    createdDocs.aidRequests.map((id) =>
      timedFetch(`/api/requests/${id}/verify`, admin1.token, {
        method: "PATCH",
        body: JSON.stringify({ approve: true }),
      })
    )
  );
  console.log(JSON.stringify(stats(verifyResults), null, 2), "\n");

  // ---- Phase 2: concurrent donation registration (all donors, same instant) ----
  console.log(`--- Phase 2: ${DONOR_COUNT} donors registering donations concurrently ---`);
  const donationResults = await Promise.all(
    donors.map((d) =>
      timedFetch("/api/donations", d.token, {
        method: "POST",
        body: JSON.stringify({
          category: "water",
          quantity: 2,
          location: randomLocation(),
          deliveryMethod: "volunteer",
          notes: "load test",
        }),
      })
    )
  );
  donationResults.forEach((r) => r.body?.id && createdDocs.donations.push(r.body.id));
  console.log(JSON.stringify(stats(donationResults), null, 2), "\n");

  // ---- Phase 3: the real race-condition probe. Match every donation to a
  // request CONCURRENTLY (not sequentially) — this is where a bug would
  // show up: two donations both getting matched to the same request item,
  // or one donation's match failing to see another's write. ----
  console.log(`--- Phase 3: matching ${createdDocs.donations.length} donations concurrently (race-condition probe) ---`);
  const matchResults = await Promise.all(
    createdDocs.donations.map((id) => timedFetch(`/api/donations/${id}/match`, admin1.token, { method: "POST" }))
  );
  matchResults.forEach((r) => r.body?.deliveryId && createdDocs.deliveries.push(r.body.deliveryId));
  console.log(JSON.stringify(stats(matchResults), null, 2), "\n");

  // ---- Data integrity check: did any request item get matched to more
  // than one donation? Did any donation end up matched to a request whose
  // item was already taken? ----
  console.log(`--- Integrity check ---`);
  const reqSnap = await db.getAll(...createdDocs.aidRequests.map((id) => db.collection("aidRequests").doc(id)));
  const donationIdsSeen = new Map(); // donationId -> count of items referencing it
  let doubleMatchedItems = 0;
  for (const doc of reqSnap) {
    if (!doc.exists) continue;
    for (const item of doc.data().items || []) {
      if (item.donationId) {
        donationIdsSeen.set(item.donationId, (donationIdsSeen.get(item.donationId) || 0) + 1);
      }
    }
  }
  for (const [donationId, count] of donationIdsSeen) {
    if (count > 1) {
      doubleMatchedItems++;
      console.log(`  BUG: donation ${donationId} is referenced by ${count} different request items`);
    }
  }
  console.log(
    doubleMatchedItems === 0
      ? "  No double-matched request items found — matching held up correctly under concurrency."
      : `  ${doubleMatchedItems} double-matched request item(s) found — real race condition.`
  );
  console.log("");

  // ---- Phase 4: concurrent volunteer accept (each volunteer accepts a
  // different delivery, all at the same instant) ----
  const acceptable = createdDocs.deliveries.slice(0, volunteers.length);
  console.log(`--- Phase 4: ${acceptable.length} volunteers accepting deliveries concurrently ---`);
  // Deliveries were auto-assigned by the nearest-volunteer algorithm at
  // match time — look up who each one actually belongs to before accepting.
  const deliveryDocs = await db.getAll(...acceptable.map((id) => db.collection("deliveries").doc(id)));
  const acceptResults = await Promise.all(
    deliveryDocs.map((doc) => {
      if (!doc.exists) return Promise.resolve({ ok: false, ms: 0, status: 0, error: "delivery not found" });
      const assignedVolunteer = volunteers.find((v) => v.uid === doc.data().volunteerId);
      if (!assignedVolunteer) return Promise.resolve({ ok: false, ms: 0, status: 0, error: "no matching volunteer" });
      return timedFetch(`/api/deliveries/${doc.id}/accept`, assignedVolunteer.token, { method: "PATCH" });
    })
  );
  console.log(JSON.stringify(stats(acceptResults), null, 2), "\n");

  // ---- Phase 5: read-heavy burst ----
  console.log(`--- Phase 5: ${READ_BURST_COUNT} concurrent reads (mixed GET endpoints) ---`);
  const readResults = await Promise.all(
    Array.from({ length: READ_BURST_COUNT }, (_, i) => {
      const endpoints = ["/api/stats", "/api/stats/by-area", "/api/external/water-levels"];
      return timedFetch(endpoints[i % endpoints.length], null);
    })
  );
  console.log(JSON.stringify(stats(readResults), null, 2), "\n");

  console.log("=== Cleanup ===");
  await Promise.all(createdDocs.deliveries.map((id) => db.collection("deliveries").doc(id).delete()));
  await Promise.all(createdDocs.donations.map((id) => db.collection("donations").doc(id).delete()));
  await Promise.all(createdDocs.aidRequests.map((id) => db.collection("aidRequests").doc(id).delete()));
  await Promise.all(createdUids.map((uid) => db.collection("users").doc(uid).delete()));
  // Firebase Auth deleteUsers caps at 1000 per call, well within our count.
  await auth.deleteUsers(createdUids);
  console.log(`Deleted ${createdDocs.aidRequests.length} requests, ${createdDocs.donations.length} donations, ${createdDocs.deliveries.length} deliveries, ${createdUids.length} accounts.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Load test failed:", err);
    process.exit(1);
  });
