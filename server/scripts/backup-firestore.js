/**
 * Dumps every Firestore collection this project uses to local JSON files —
 * a safety net for the real demo dataset (used throughout development and
 * needed for the viva) against being lost to a bug or accidental deletion
 * during testing. Not a `gcloud firestore export` (that needs a GCS bucket
 * and the gcloud CLI, neither of which this project otherwise needs) —
 * a plain Admin SDK read-and-write-to-JSON is simpler and needs nothing
 * beyond what's already installed.
 *
 * Run: node scripts/backup-firestore.js
 * Output: server/backups/<timestamp>/<collection>.json (gitignored — this
 * data includes real PII like NIC numbers and home addresses, so it must
 * never be committed).
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { db } = require("../src/config/firebase");

// Every top-level collection this app writes to (see CLAUDE.md's "Data
// model" section) — kept as an explicit list rather than discovering
// collections dynamically, so a backup run fails loudly (missing from this
// list) rather than silently, if a new collection is ever added.
const COLLECTIONS = [
  "users",
  "aidRequests",
  "donations",
  "deliveries",
  "categoryLimits",
  "broadcasts",
  "caseNotes",
  "auditLog",
  "activeDistricts",
  "deliveryChats",
  "chatMessages",
  "sosRequests",
  "communityReports",
  "waterLevelAlertState",
  "waterLevelAlertSettings",
  "pendingAreaAlerts",
  "sentAreaAlerts",
];

async function backupCollection(name, outDir) {
  const snapshot = await db.collection(name).get();
  const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(docs, null, 2));
  return docs.length;
}

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(__dirname, "../backups", timestamp);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Backing up ${COLLECTIONS.length} collections to ${outDir}...`);
  let totalDocs = 0;
  for (const name of COLLECTIONS) {
    try {
      const count = await backupCollection(name, outDir);
      totalDocs += count;
      console.log(`  ${name}: ${count} documents`);
    } catch (err) {
      console.error(`  ${name}: FAILED - ${err.message}`);
    }
  }
  console.log(`Done. ${totalDocs} documents backed up to ${outDir}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backup failed:", err);
    process.exit(1);
  });
