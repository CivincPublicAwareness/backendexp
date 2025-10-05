const express = require("express");
const {
  trackPhoneInteraction,
  getPhoneAnalytics,
} = require("../controllers/analyticsController");

const router = express.Router();

// Analytics routes
router.post("/track-phone-interaction", trackPhoneInteraction);
router.get("/phone-analytics", getPhoneAnalytics);

module.exports = router;
