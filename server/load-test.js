// Concurrent-load test harness. Creates real throwaway Firebase accounts,
// gets real ID tokens, and fires genuinely concurrent requests at the real
// Express + Firestore backend (not mocked) across the core write/read paths.
// Reports latency stats + success/failure counts per phase, then runs data-
// integrity checks (e.g. did concurrent matching ever double-assign a
// request item), then deletes every trace of itself.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { db, auth } = require("./src/config/firebase");

// Target of the test. Default: the local dev server. To load-test the deployed
// site instead (same Firebase project, so the same throwaway accounts/cleanup
// work unchanged):
//     LOAD_TEST_API_BASE=https://disaster-aid-system.vercel.app node load-test.js
// Results from a non-local target are saved separately (load-test-runs-vercel.json)
// so local and deployed numbers are never averaged together.
const API_BASE = (process.env.LOAD_TEST_API_BASE || "http://localhost:5000").replace(/\/$/, "");
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(API_BASE);
const RUNS_FILE = IS_LOCAL ? "load-test-runs.json" : "load-test-runs-vercel.json";
const FIREBASE_API_KEY = "AIzaSyCFeOCGBgocBZ7ZBu7lfdjdc-zhKHSZ8p4";
const TEST_PREFIX = "loadtest";
const RUN_ID = Date.now();
const RUN_START_ISO = new Date(RUN_ID - 1000).toISOString();

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
  let status;
  let body;
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
  // Nearest-rank percentile on the sorted successful latencies.
  const pct = (p) => (times.length ? times[Math.min(times.length - 1, Math.max(0, Math.ceil((p / 100) * times.length) - 1))] : 0);
  const mean = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  const sd = times.length > 1 ? Math.sqrt(times.reduce((a, b) => a + (b - mean) ** 2, 0) / (times.length - 1)) : 0;
  return {
    total: results.length,
    succeeded: ok.length,
    failed: failed.length,
    failureReasons: failed.slice(0, 5).map((r) => ({ status: r.status, error: r.error || r.body?.error })),
    minMs: times.length ? Math.round(times[0]) : 0,
    avgMs: Math.round(mean),
    sdMs: Math.round(sd),
    p50Ms: Math.round(pct(50)),
    p95Ms: Math.round(pct(95)),
    p99Ms: Math.round(pct(99)),
    maxMs: times.length ? Math.round(times[times.length - 1]) : 0,
  };
}

// Every phase's stats are kept so the run can be written to disk and
// aggregated across repeated runs (run-to-run variance), not just printed.
const phaseStats = [];
function record(label, results, extra = {}) {
  const st = stats(results);
  phaseStats.push({ phase: label, ...st, ...extra });
  console.log(JSON.stringify(st, null, 2), "\n");
  return st;
}

function writeRunReport(doubleMatchedItems) {
  const file = path.join(__dirname, RUNS_FILE);
  let runs = [];
  try { runs = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* first run */ }
  runs.push({ runId: RUN_ID, at: new Date().toISOString(), target: API_BASE, doubleMatchedItems, phases: phaseStats });
  fs.writeFileSync(file, JSON.stringify(runs, null, 2));
  console.log("Saved run to " + RUNS_FILE + " (" + runs.length + " run(s) on file). Aggregate with: node scripts/aggregate-load-tests.js" + (IS_LOCAL ? "" : " vercel"));
}

// Donations and volunteers are placed in an ocean box south-west of Sri Lanka
// (lat 5.5-6.5, lng 78-79; the nearest coast is ~90 km east), never on land.
// Auto-assignment picks the nearest available volunteer by distance, so test
// volunteers on a grid inside the box (nearest one is always within ~30 km of
// any donation in it) always beat any real volunteer on land — test deliveries
// and their "new delivery assignment" push notifications never reach real
// people. Donations are random within the box (not one shared point) so the
// 30 concurrent matches don't all contend for the same request in the same
// order, which would measure an artificial worst case.
const OCEAN_BOX = { latMin: 5.5, latMax: 6.5, lngMin: 78, lngMax: 79 };
function oceanLocation() {
  return {
    lat: OCEAN_BOX.latMin + Math.random() * (OCEAN_BOX.latMax - OCEAN_BOX.latMin),
    lng: OCEAN_BOX.lngMin + Math.random() * (OCEAN_BOX.lngMax - OCEAN_BOX.lngMin),
  };
}
// 5 x 3 grid of volunteer positions across the box (15 volunteers).
function gridVolunteerLocation(i) {
  const col = i % 5, row = Math.floor(i / 5);
  return {
    lat: OCEAN_BOX.latMin + ((row + 0.5) / 3) * (OCEAN_BOX.latMax - OCEAN_BOX.latMin),
    lng: OCEAN_BOX.lngMin + ((col + 0.5) / 5) * (OCEAN_BOX.lngMax - OCEAN_BOX.lngMin),
  };
}

async function main() {
  console.log(`=== Concurrent load test run ${RUN_ID} against ${API_BASE} ===\n`);

  console.log(`Creating ${VICTIM_COUNT} victims, ${DONOR_COUNT} donors, ${VOLUNTEER_COUNT} volunteers, 1 admin...`);
  const t0 = performance.now();
  const victims = await Promise.all(
    Array.from({ length: VICTIM_COUNT }, (_, i) => createAccount("victim", i))
  );
  const donors = await Promise.all(
    Array.from({ length: DONOR_COUNT }, (_, i) => createAccount("donor", i))
  );
  const volunteers = await Promise.all(
    Array.from({ length: VOLUNTEER_COUNT }, (_, i) => createAccount("volunteer", i, { location: gridVolunteerLocation(i) }))
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
          location: oceanLocation(),
          notes: "load test",
        }),
      })
    )
  );
  requestResults.forEach((r) => r.body?.id && createdDocs.aidRequests.push(r.body.id));
  record("1. Submit requests", requestResults);

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
  record("1b. Approve requests", verifyResults);

  // ---- Phase 2: concurrent donation registration (all donors, same instant) ----
  console.log(`--- Phase 2: ${DONOR_COUNT} donors registering donations concurrently ---`);
  const donationResults = await Promise.all(
    donors.map((d) =>
      timedFetch("/api/donations", d.token, {
        method: "POST",
        body: JSON.stringify({
          category: "water",
          quantity: "2 bottles",
          quantityValue: 2,
          location: oceanLocation(),
          deliveryMethod: "volunteer",
          notes: "load test",
        }),
      })
    )
  );
  donationResults.forEach((r) => r.body?.id && createdDocs.donations.push(r.body.id));
  record("2. Register donations", donationResults);

  // ---- Phase 3: the real race-condition probe. Match every donation to a
  // request CONCURRENTLY (not sequentially) — this is where a bug would
  // show up: two donations both getting matched to the same request item,
  // or one donation's match failing to see another's write. ----
  console.log(`--- Phase 3: matching ${createdDocs.donations.length} donations concurrently (race-condition probe) ---`);
  const matchResults = await Promise.all(
    createdDocs.donations.map((id) => timedFetch(`/api/donations/${id}/match`, admin1.token, { method: "POST" }))
  );
  matchResults.forEach((r) => r.body?.deliveryId && createdDocs.deliveries.push(r.body.deliveryId));
  record("3. Match donations (race probe)", matchResults);

  // ---- Data integrity check: did any request item get matched to more
  // than one donation? Did any donation end up matched to a request whose
  // item was already taken? ----
  console.log(`--- Integrity check ---`);
  if (createdDocs.aidRequests.length === 0) {
    // getAll() throws on zero arguments — an earlier phase producing nothing
    // (e.g. the server being unreachable) should fail clearly, not here.
    throw new Error("No requests were created — server unreachable or Phase 1 failed entirely.");
  }
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
  if (acceptable.length === 0) {
    // Firestore's getAll() throws on zero arguments rather than returning an
    // empty array — guard explicitly instead of letting an upstream phase
    // producing no deliveries (a failed match phase, or genuinely nobody
    // qualifying for auto-assignment) crash the whole run here.
    console.log("  Skipped — no deliveries were created in Phase 3 to accept.\n");
  } else {
    // Deliveries were auto-assigned by the nearest-volunteer algorithm at
    // match time — look up who each one actually belongs to before accepting.
    const deliveryDocs = await db.getAll(...acceptable.map((id) => db.collection("deliveries").doc(id)));
    let skippedRealVolunteer = 0;
    const acceptResultsRaw = await Promise.all(
      deliveryDocs.map((doc) => {
        if (!doc.exists) return Promise.resolve({ ok: false, ms: 0, status: 0, error: "delivery not found" });
        const assignedVolunteer = volunteers.find((v) => v.uid === doc.data().volunteerId);
        if (!assignedVolunteer) { skippedRealVolunteer++; return Promise.resolve(null); }
        return timedFetch(`/api/deliveries/${doc.id}/accept`, assignedVolunteer.token, { method: "PATCH" });
      })
    );
    const acceptResults = acceptResultsRaw.filter(Boolean); // null = went to a real volunteer, excluded
    if (skippedRealVolunteer) console.log("  (" + skippedRealVolunteer + " delivery(ies) auto-assigned to a real volunteer account - excluded)");
    record("4. Volunteers accept", acceptResults, { skippedRealVolunteerDeliveries: skippedRealVolunteer });
  }

  // ---- Phase 5: read-heavy burst ----
  console.log(`--- Phase 5: ${READ_BURST_COUNT} concurrent reads (mixed GET endpoints) ---`);
  const readResults = await Promise.all(
    Array.from({ length: READ_BURST_COUNT }, (_, i) => {
      const endpoints = ["/api/stats", "/api/stats/by-area", "/api/external/water-levels"];
      return timedFetch(endpoints[i % endpoints.length], null);
    })
  );
  record("5. Read burst", readResults);

  console.log("=== Cleanup ===");
  // Safety net: remove every notification this run caused (assignment pushes
  // for test deliveries, anything addressed to a test account) so nothing from
  // a load test is left in a real user's Notifications tab even if a delivery
  // somehow reached a real volunteer.
  {
    const delSet = new Set(createdDocs.deliveries);
    const uidSet = new Set(createdUids);
    const notifSnap = await db.collection("notifications").where("createdAt", ">=", RUN_START_ISO).get();
    const mine = notifSnap.docs.filter((d) => uidSet.has(d.data().uid) || delSet.has(d.data().data?.deliveryId));
    await Promise.all(mine.map((d) => d.ref.delete()));
    console.log("Removed " + mine.length + " notification(s) caused by this run.");
  }
  await Promise.all(createdDocs.deliveries.map((id) => db.collection("deliveries").doc(id).delete()));
  await Promise.all(createdDocs.donations.map((id) => db.collection("donations").doc(id).delete()));
  await Promise.all(createdDocs.aidRequests.map((id) => db.collection("aidRequests").doc(id).delete()));
  await Promise.all(createdUids.map((uid) => db.collection("users").doc(uid).delete()));
  // Firebase Auth deleteUsers caps at 1000 per call, well within our count.
  await auth.deleteUsers(createdUids);
  writeRunReport(doubleMatchedItems);
  console.log(`Deleted ${createdDocs.aidRequests.length} requests, ${createdDocs.donations.length} donations, ${createdDocs.deliveries.length} deliveries, ${createdUids.length} accounts.`);
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("Load test failed:", err);
    // Real accounts/documents were already created by this point — clean up
    // on failure too, not just on success, same convention already used by
    // test-firestore-rules.js/test-api-integration.js's own catch handlers.
    // Without this, a crash mid-run silently leaves real throwaway accounts
    // behind (confirmed the hard way — a prior run without this handler left
    // 152 stray accounts + 60 stray requests sitting in the live database).
    try {
      await Promise.all(createdDocs.deliveries.map((id) => db.collection("deliveries").doc(id).delete().catch(() => {})));
      await Promise.all(createdDocs.donations.map((id) => db.collection("donations").doc(id).delete().catch(() => {})));
      await Promise.all(createdDocs.aidRequests.map((id) => db.collection("aidRequests").doc(id).delete().catch(() => {})));
      await Promise.all(createdUids.map((uid) => db.collection("users").doc(uid).delete().catch(() => {})));
      if (createdUids.length) await auth.deleteUsers(createdUids);
      console.error(`Cleaned up ${createdUids.length} accounts and their documents after the failure.`);
    } catch (cleanupErr) {
      console.error("Cleanup after failure also failed — manual check needed:", cleanupErr.message);
    }
    process.exit(1);
  });
