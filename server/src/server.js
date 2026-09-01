require("dotenv").config();
const app = require("./app");
const { checkWaterLevelsAndAlert, checkReservoirsAndAlert } = require("./utils/waterLevelAlerts");

const PORT = process.env.PORT || 5000;
const WATER_LEVEL_ALERT_POLL_MS = 10 * 60 * 1000; // 10 min — matches the operational urgency without re-checking on every cache refresh
const RESERVOIR_ALERT_POLL_MS = 60 * 60 * 1000; // 1h — the reservoir bulletin itself only updates once a day

app.listen(PORT, () => {
  console.log(`Disaster Aid API listening on http://localhost:${PORT}`);
});

// Run once at startup (so gauge state is initialized without waiting a full
// poll cycle) and then on a timer — this is what actually detects a rising
// water level and triggers area alerts, independent of anyone loading a map.
checkWaterLevelsAndAlert();
setInterval(checkWaterLevelsAndAlert, WATER_LEVEL_ALERT_POLL_MS);

// Same pattern, for reservoir storage-risk escalations.
checkReservoirsAndAlert();
setInterval(checkReservoirsAndAlert, RESERVOIR_ALERT_POLL_MS);
