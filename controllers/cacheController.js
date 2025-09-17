const {
  getCacheStats,
  clearAllCache,
  clearExpiredCache,
} = require("../utils/cache");

const getCacheStatsController = async (req, res) => {
  try {
    const stats = await getCacheStats();
    res.json(stats);
  } catch (error) {
    console.error("Error getting cache stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const clearAllCacheController = async (req, res) => {
  try {
    const result = await clearAllCache();
    res.json(result);
  } catch (error) {
    console.error("Error clearing cache:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const clearExpiredCacheController = async (req, res) => {
  try {
    const result = await clearExpiredCache();
    res.json(result);
  } catch (error) {
    console.error("Error clearing expired cache:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const clearSpecificCacheController = async (req, res) => {
  try {
    const { city, ward_no, language } = req.body;

    if (!city || !ward_no || !language) {
      return res.status(400).json({
        error: "city, ward_no, and language are required",
      });
    }

    const redisClient = require("../utils/redis");
    const { generateCacheKey } = require("../utils/cache");

    const key = generateCacheKey(city, ward_no, language);
    const result = await redisClient.del(key);

    if (result === 1) {
      res.json({
        message: "Cache entry cleared successfully",
        key: key,
        city: city,
        ward_no: ward_no,
        language: language,
      });
    } else {
      res.json({
        message: "Cache entry not found",
        key: key,
        city: city,
        ward_no: ward_no,
        language: language,
      });
    }
  } catch (error) {
    console.error("Error clearing specific cache:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  getCacheStatsController,
  clearAllCacheController,
  clearExpiredCacheController,
  clearSpecificCacheController,
};
