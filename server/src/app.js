const express = require("express");
const cors = require("cors");

const usersRoutes = require("./routes/users");
const requestsRoutes = require("./routes/requests");
const donationsRoutes = require("./routes/donations");
const deliveriesRoutes = require("./routes/deliveries");
const statsRoutes = require("./routes/stats");
const externalRoutes = require("./routes/external");
const categoriesRoutes = require("./routes/categories");
const broadcastsRoutes = require("./routes/broadcasts");
const auditLogRoutes = require("./routes/auditLog");
const activeDistrictsRoutes = require("./routes/activeDistricts");
const waterAlertsRoutes = require("./routes/waterAlerts");
const sosRoutes = require("./routes/sos");
const communityReportsRoutes = require("./routes/communityReports");
const chatsRoutes = require("./routes/chats");

const app = express();

// Allow requests from your frontend. Add every URL your frontend runs on
// (local dev, Lovable preview, production) as a comma-separated list in .env
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",");
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json());

// Simple health check — visit this in your browser to confirm the server is alive
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Disaster Aid API is running." });
});

app.use("/api/users", usersRoutes);
app.use("/api/requests", requestsRoutes);
app.use("/api/donations", donationsRoutes);
app.use("/api/deliveries", deliveriesRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/external", externalRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/broadcasts", broadcastsRoutes);
app.use("/api/audit-log", auditLogRoutes);
app.use("/api/active-districts", activeDistrictsRoutes);
app.use("/api/water-alerts", waterAlertsRoutes);
app.use("/api/sos", sosRoutes);
app.use("/api/community-reports", communityReportsRoutes);
app.use("/api/chats", chatsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `No route found for ${req.method} ${req.originalUrl}` });
});

// Central error handler (catches anything thrown that wasn't already caught)
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

module.exports = app;
