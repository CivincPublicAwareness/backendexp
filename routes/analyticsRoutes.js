const express = require("express");
const {
  trackPhoneInteraction,
  getPhoneAnalytics,
  analyticsReportLogin,
  verifyAnalyticsReportToken,
  exportPhoneAnalyticsToExcel,
} = require("../controllers/analyticsController");

const router = express.Router();

// Analytics routes
router.post("/track-phone-interaction", trackPhoneInteraction);
router.get("/phone-analytics", getPhoneAnalytics);
router.post("/report/login", analyticsReportLogin);
router.get("/report/verify", verifyAnalyticsReportToken);
router.get("/export/excel", exportPhoneAnalyticsToExcel);

module.exports = router;
