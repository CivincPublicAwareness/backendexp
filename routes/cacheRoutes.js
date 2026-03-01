const express = require("express");
const {
  getCacheStatsController,
  clearAllCacheController,
  clearExpiredCacheController,
  clearSpecificCacheController,
} = require("../controllers/cacheController");

const router = express.Router();

// Cache management routes
router.get("/stats", getCacheStatsController);
router.post("/clear", clearAllCacheController);
router.post("/clear-expired", clearExpiredCacheController);
router.post("/clear-specific", clearSpecificCacheController);

module.exports = router;
