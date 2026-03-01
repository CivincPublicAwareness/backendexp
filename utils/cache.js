// Cache management utilities
const redisClient = require("./redis");

// Cache TTL: 5 minutes for general data, but ward data NEVER expires
const CACHE_TTL = 5 * 60; // 5 minutes in seconds
const WARD_CACHE_TTL = -1; // NEVER expires (until manually cleared or server restart)

// Redis cache configuration
const REDIS_KEY_PREFIX = "civinc:cache:";
const MAX_ENTRY_SIZE_KB = 50;

// Helper function to get Redis cache size (approximate)
const getCacheSizeMB = async () => {
  try {
    // Get memory info using INFO command instead of memoryUsage()
    const info = await redisClient.info("memory");
    const usedMemoryMatch = info.match(/used_memory:(\d+)/);
    if (usedMemoryMatch) {
      return parseInt(usedMemoryMatch[1]) / (1024 * 1024); // Convert to MB
    }
    return 0;
  } catch (error) {
    console.error("Error getting Redis cache size:", error);
    return 0;
  }
};

// Helper function to get entry size in KB
const getEntrySizeKB = (data) => {
  const size = JSON.stringify(data).length;
  return size / 1024; // Convert to KB
};

// Helper function to generate cache key
const generateCacheKey = (city, ward_no, language) => {
  return `${REDIS_KEY_PREFIX}${city}_${ward_no}_${language}`;
};

// Helper function to get from Redis cache
const getFromCache = async (city, ward_no, language, isWardData = false) => {
  const key = generateCacheKey(city, ward_no, language);
  console.log("Getting from cache:", key);
  try {
    const cachedData = await redisClient.get(key);

    if (cachedData) {
      const parsedData = JSON.parse(cachedData);
      return parsedData;
    } else {
      return null;
    }
  } catch (error) {
    console.error(`Redis GET error for key ${key}:`, error);
    return null;
  }
};

// Helper function to set Redis cache
const setCache = async (city, ward_no, language, data, isWardData = false) => {
  const key = generateCacheKey(city, ward_no, language);

  // Check entry size limit
  const entrySizeKB = getEntrySizeKB(data);
  if (entrySizeKB > MAX_ENTRY_SIZE_KB) {
    return false;
  }

  try {
    // Set TTL based on data type
    const ttl = isWardData ? WARD_CACHE_TTL : CACHE_TTL;

    // Store data in Redis with TTL
    if (ttl === -1) {
      // Never expires - use set instead of setEx
      await redisClient.set(key, JSON.stringify(data));
    } else {
      // Has TTL - use setEx (convert TTL to string)
      await redisClient.setEx(key, ttl.toString(), JSON.stringify(data));
    }

    return true;
  } catch (error) {
    console.error(`Redis SET error for key ${key}:`, error);
    return false;
  }
};

const clearOldestEntries = async (count) => {
  try {
    // Use SCAN instead of KEYS to avoid blocking Redis
    const keys = [];
    let cursor = 0;

    do {
      const result = await redisClient.scan(cursor.toString(), {
        MATCH: `${REDIS_KEY_PREFIX}*`,
        COUNT: "100",
      });

      cursor = result.cursor;
      keys.push(...result.keys);
    } while (cursor !== "0");

    if (keys.length === 0) {
      console.log("No cache entries to clear");
      return;
    }

    // Redis automatically handles TTL, so we just log the current state
    console.log(
      `Redis cache has ${keys.length} entries. TTL is handled automatically.`
    );

    // Optional: Clear some keys if needed (but Redis TTL should handle this)
    if (keys.length > 1000) {
      // Arbitrary limit
      const keysToDelete = keys.slice(0, count);
      await redisClient.del(keysToDelete);
      console.log(`Cleared ${keysToDelete.length} cache entries manually`);
    }
  } catch (error) {
    console.error("Error clearing cache entries:", error);
  }
};

const cleanupExpiredCache = async () => {
  try {
    console.log(`\n=== CACHE CLEANUP START ===`);

    // Use SCAN instead of KEYS to avoid blocking Redis
    const keys = [];
    let cursor = 0;

    do {
      const result = await redisClient.scan(cursor.toString(), {
        MATCH: `${REDIS_KEY_PREFIX}*`,
        COUNT: "100", // Process 100 keys at a time - must be string
      });

      cursor = result.cursor;
      keys.push(...result.keys);
    } while (cursor !== "0");

    if (keys.length === 0) {
      console.log("No cache entries found");
      console.log(`=== CACHE CLEANUP END ===\n`);
      return;
    }

    let wardDataCount = 0;
    let generalDataCount = 0;

    // Process keys in batches to avoid overwhelming Redis
    const batchSize = 50;
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);

      // Get TTL for batch of keys
      const ttlPromises = batch.map((key) => redisClient.ttl(key));
      const ttls = await Promise.all(ttlPromises);

      batch.forEach((key, index) => {
        const ttl = ttls[index];
        const isWardData = ttl === -1; // Never expires

        if (isWardData) {
          wardDataCount++;
          console.log(`Entry: ${key} | WARD DATA: TTL=${ttl}s (preserved)`);
        } else {
          generalDataCount++;
          console.log(`Entry: ${key} | GENERAL DATA: TTL=${ttl}s`);
        }
      });
    }

    console.log(`\n=== CACHE CLEANUP SUMMARY ===`);
    console.log(
      `Ward data entries: ${wardDataCount} (NEVER expires - until next elections)`
    );
    console.log(
      `General data entries: ${generalDataCount} (expires after 5 minutes)`
    );
    console.log(`Cleanup completed: Ward data preserved indefinitely`);
    console.log(`=== CACHE CLEANUP END ===\n`);
  } catch (error) {
    console.error("Error during cache cleanup:", error);
  }
};

// Get cache statistics
const getCacheStats = async () => {
  try {
    // Use SCAN instead of KEYS to avoid blocking Redis
    const keys = [];
    let cursor = 0;

    do {
      const result = await redisClient.scan(cursor.toString(), {
        MATCH: `${REDIS_KEY_PREFIX}*`,
        COUNT: "100",
      });

      cursor = result.cursor;
      keys.push(...result.keys);
    } while (cursor !== "0");

    let wardDataEntries = 0;
    let generalDataEntries = 0;
    const cacheEntries = [];

    // Process keys in batches
    const batchSize = 50;
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);

      // Get TTL for batch of keys
      const ttlPromises = batch.map((key) => redisClient.ttl(key));
      const ttls = await Promise.all(ttlPromises);

      batch.forEach((key, index) => {
        const ttl = ttls[index];
        const isWardData = ttl === -1;

        cacheEntries.push({
          key,
          isWardData,
          ttl_seconds: ttl,
          ttl_human: ttl === -1 ? "Never expires" : `${ttl}s`,
        });

        if (isWardData) {
          wardDataEntries++;
        } else {
          generalDataEntries++;
        }
      });
    }

    const cacheSizeMB = await getCacheSizeMB();

    return {
      total_entries: keys.length,
      valid_entries: keys.length,
      expired_entries: 0,
      ward_data_entries: wardDataEntries,
      general_data_entries: generalDataEntries,
      cache_size_mb: cacheSizeMB.toFixed(2),
      cache_ttl_minutes: CACHE_TTL / 60,
      ward_cache_ttl_seconds: WARD_CACHE_TTL,
      ward_cache_ttl_human:
        WARD_CACHE_TTL === -1 ? "NEVER EXPIRES" : `${WARD_CACHE_TTL}s`,
      cache_entries: cacheEntries,
      redis_connected: redisClient.isOpen,
      note: "Ward data NEVER expires (until next elections). General data expires after 5 minutes.",
    };
  } catch (error) {
    console.error("Error getting cache stats:", error);
    return {
      error: "Failed to get cache stats",
      redis_connected: redisClient.isOpen,
    };
  }
};

// Clear all cache
const clearAllCache = async () => {
  try {
    // Use SCAN instead of KEYS to avoid blocking Redis
    const keys = [];
    let cursor = 0;

    do {
      const result = await redisClient.scan(cursor.toString(), {
        MATCH: `${REDIS_KEY_PREFIX}*`,
        COUNT: "100",
      });

      cursor = result.cursor;
      keys.push(...result.keys);
    } while (cursor !== "0");

    const beforeSize = keys.length;

    if (keys.length > 0) {
      // Delete keys in batches to avoid overwhelming Redis
      const batchSize = 100;
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        await redisClient.del(batch);
      }
    }

    return {
      message: "Cache cleared successfully",
      entries_removed: beforeSize,
    };
  } catch (error) {
    console.error("Error clearing cache:", error);
    return {
      error: "Failed to clear cache",
      redis_connected: redisClient.isOpen,
    };
  }
};

// Clear expired cache entries
const clearExpiredCache = async () => {
  try {
    await cleanupExpiredCache();

    // Use SCAN to count remaining entries
    const keys = [];
    let cursor = 0;

    do {
      const result = await redisClient.scan(cursor.toString(), {
        MATCH: `${REDIS_KEY_PREFIX}*`,
        COUNT: "100",
      });

      cursor = result.cursor;
      keys.push(...result.keys);
    } while (cursor !== "0");

    return {
      message: "Cache cleanup completed",
      remaining_entries: keys.length,
      note: "Redis handles TTL automatically. Ward data never expires.",
    };
  } catch (error) {
    console.error("Error during cache cleanup:", error);
    return {
      error: "Failed to cleanup cache",
      redis_connected: redisClient.isOpen,
    };
  }
};

module.exports = {
  getFromCache,
  setCache,
  generateCacheKey,
  getCacheStats,
  clearAllCache,
  clearExpiredCache,
  cleanupExpiredCache,
};
