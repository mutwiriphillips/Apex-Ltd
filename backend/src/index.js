require("dotenv").config();
require("express-async-errors");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth");
const staffRoutes = require("./routes/staff");
const cooperativeRoutes = require("./routes/cooperatives");
const documentRoutes = require("./routes/documents");
const governanceRoutes = require("./routes/governance");
const fieldOpsRoutes = require("./routes/fieldOps");
const countyRoutes = require("./routes/counties");
const contributionRoutes = require("./routes/contributions");
const creditAssessmentRoutes = require("./routes/creditAssessment");
const produceRoutes = require("./routes/produce");
const payoutRoutes = require("./routes/payouts");
const assetRoutes = require("./routes/assets");
const reportsRoutes = require("./routes/reports");
const memberAuthRoutes = require("./routes/memberAuth");
const memberRoutes = require("./routes/member");
const errorHandler = require("./middleware/errorHandler");

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:3000", credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan(process.env.NODE_ENV === "development" ? "dev" : "combined"));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/api/health", (req, res) => res.json({ status: "ok", service: "embu-coop-backend" }));

app.use("/api/auth", authRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/counties", countyRoutes);
app.use("/api/cooperatives", cooperativeRoutes);
// Nested resources under a cooperative
app.use("/api/cooperatives/:id/documents", documentRoutes);
app.use("/api/cooperatives/:id/governance", governanceRoutes);
app.use("/api/cooperatives/:id/contributions", contributionRoutes);
app.use("/api/cooperatives/:id/credit-assessment", creditAssessmentRoutes);
app.use("/api/cooperatives/:id/produce", produceRoutes);
app.use("/api/cooperatives/:id/payouts", payoutRoutes);
app.use("/api/cooperatives/:id/assets", assetRoutes);
app.use("/api/field-ops", fieldOpsRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/member-auth", memberAuthRoutes);
app.use("/api/member", memberRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Embu Coop backend listening on port ${PORT}`);
});

module.exports = app;
