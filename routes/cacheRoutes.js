const express = require("express");
const {
  getCacheStatsController,
  clearAllCacheController,
  clearExpiredCacheController,
} = require("../controllers/cacheController");

const router = express.Router();

// Cache management routes
router.get("/stats", getCacheStatsController);
router.post("/clear", clearAllCacheController);
router.post("/clear-expired", clearExpiredCacheController);

module.exports = router;
