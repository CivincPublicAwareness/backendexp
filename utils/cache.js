// Cache management utilities
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const WARD_CACHE_TTL = Number.MAX_SAFE_INTEGER; // Effectively never expires - stays in memory indefinitely

// Memory protection limits
const MAX_CACHE_ENTRIES = 1000;
const MAX_CACHE_SIZE_MB = 100;
const MAX_ENTRY_SIZE_KB = 50;

const wardCache = new Map();

const getCacheSizeMB = () => {
  let totalSize = 0;
  for (const [key, entry] of wardCache.entries()) {
    const entrySize = key.length + JSON.stringify(entry.data).length + 8;
    totalSize += entrySize;
  }
  return totalSize / (1024 * 1024);
};

// Helper function to get entry size in KB
const getEntrySizeKB = (data) => {
  const size = JSON.stringify(data).length;
  return size / 1024; // Convert to KB
};

// Helper function to generate cache key
const generateCacheKey = (city, ward_no, language) => {
  return `${city}_${ward_no}_${language}`;
};

// Helper function to check if cache entry is valid
const isCacheValid = (cacheEntry, isWardData = false) => {
  if (isWardData) {
    // Ward data NEVER expires - always valid
    return cacheEntry && cacheEntry.data;
  }
  // General data uses TTL
  const ttl = CACHE_TTL;
  return cacheEntry && Date.now() - cacheEntry.timestamp < ttl;
};

// Helper function to get from cache
const getFromCache = (city, ward_no, language, isWardData = false) => {
  const key = generateCacheKey(city, ward_no, language);
  const cacheEntry = wardCache.get(key);

  if (isCacheValid(cacheEntry, isWardData)) {
    return cacheEntry.data;
  }

  if (cacheEntry) {
    wardCache.delete(key);
  }

  return null;
};

// Helper function to set cache
const setCache = (city, ward_no, language, data, isWardData = false) => {
  const key = generateCacheKey(city, ward_no, language);

  // Check entry size limit
  const entrySizeKB = getEntrySizeKB(data);
  if (entrySizeKB > MAX_ENTRY_SIZE_KB) {
    return false;
  }

  // Check cache size limits
  const currentSizeMB = getCacheSizeMB();
  if (currentSizeMB + entrySizeKB / 1024 > MAX_CACHE_SIZE_MB) {
    clearOldestEntries(10);
  }

  // Check entry count limit
  if (wardCache.size >= MAX_CACHE_ENTRIES) {
    clearOldestEntries(10);
  }

  wardCache.set(key, {
    data: data,
    timestamp: Date.now(),
    isWardData: isWardData,
  });

  return true;
};

// Helper function to clear oldest cache entries
const clearOldestEntries = (count) => {
  const entries = Array.from(wardCache.entries());

  // Sort by priority: ward data first (NEVER cleared), then by timestamp (oldest first)
  entries.sort((a, b) => {
    // Ward data (isWardData: true) should NEVER be cleared
    if (a[1].isWardData && !b[1].isWardData) return -1;
    if (!a[1].isWardData && b[1].isWardData) return 1;

    // If both are same type, sort by timestamp (oldest first)
    return a[1].timestamp - b[1].timestamp;
  });

  // Only clear non-ward entries - ward data is NEVER cleared automatically
  const nonWardEntries = entries.filter((entry) => !entry[1].isWardData);

  // Clear the specified number of oldest non-ward entries
  const entriesToClear = Math.min(count, nonWardEntries.length);
  for (let i = 0; i < entriesToClear; i++) {
    const key = nonWardEntries[i][0];
    wardCache.delete(key);
  }
};

// Helper function to clear expired cache entries
const cleanupExpiredCache = () => {
  const now = Date.now();

  for (const [key, entry] of wardCache.entries()) {
    if (!entry.isWardData && now - entry.timestamp > CACHE_TTL) {
      wardCache.delete(key);
    }
  }
};

// Get cache statistics
const getCacheStats = () => {
  const now = Date.now();
  let validEntries = 0;
  let expiredEntries = 0;
  let wardDataEntries = 0;
  let generalDataEntries = 0;

  for (const [key, entry] of wardCache.entries()) {
    if (entry.isWardData) {
      wardDataEntries++;
      // Ward data never expires
      validEntries++;
    } else {
      generalDataEntries++;
      if (now - entry.timestamp < CACHE_TTL) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    }
  }

  return {
    total_entries: wardCache.size,
    valid_entries: validEntries,
    expired_entries: expiredEntries,
    ward_data_entries: wardDataEntries,
    general_data_entries: generalDataEntries,
    cache_size_mb: getCacheSizeMB().toFixed(2),
    max_cache_size_mb: MAX_CACHE_SIZE_MB,
    max_entries: MAX_CACHE_ENTRIES,
    cache_ttl_minutes: CACHE_TTL / (60 * 1000),
    ward_cache_ttl: "NEVER EXPIRES",
    note: "Ward data NEVER expires and stays in memory indefinitely until manually cleared or server shutdown",
  };
};

// Clear all cache
const clearAllCache = () => {
  const beforeSize = wardCache.size;
  wardCache.clear();
  return {
    message: "Cache cleared successfully",
    entries_removed: beforeSize,
  };
};

// Clear expired cache entries
const clearExpiredCache = () => {
  const beforeSize = wardCache.size;
  cleanupExpiredCache();
  const afterSize = wardCache.size;
  const removed = beforeSize - afterSize;
  return {
    message: "Expired cache entries cleared",
    entries_removed: removed,
    remaining_entries: afterSize,
  };
};

module.exports = {
  wardCache,
  getFromCache,
  setCache,
  generateCacheKey,
  getCacheStats,
  clearAllCache,
  clearExpiredCache,
  cleanupExpiredCache,
};
