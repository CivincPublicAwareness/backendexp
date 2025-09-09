const {
  getCacheStats,
  clearAllCache,
  clearExpiredCache,
} = require("../utils/cache");

// Get cache statistics
const getCacheStatsController = (req, res) => {
  try {
    const stats = getCacheStats();
    res.json(stats);
  } catch (error) {
    console.error("Error getting cache stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Clear all cache
const clearAllCacheController = (req, res) => {
  try {
    const result = clearAllCache();
    res.json(result);
  } catch (error) {
    console.error("Error clearing cache:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const clearExpiredCacheController = (req, res) => {
  try {
    const result = clearExpiredCache();
    res.json(result);
  } catch (error) {
    console.error("Error clearing expired cache:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  getCacheStatsController,
  clearAllCacheController,
  clearExpiredCacheController,
};
