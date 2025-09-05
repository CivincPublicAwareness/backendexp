const express = require("express");
const { PrismaClient } = require("@prisma/client");
const cors = require("cors");
const wkx = require("wkx");

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Load structured complaints data for O(1) lookup
let structuredComplaints = {};
let departmentMapping = {};
let supportedLanguages = {};

try {
  structuredComplaints = require("./structured_complaints.json");
  departmentMapping = require("./department_mapping.json");
  supportedLanguages = require("./supported_languages.json");
  console.log(
    "Structured complaints, department mapping, and supported languages loaded successfully"
  );
} catch (error) {
  console.error("Error loading configuration files:", error);
  console.log("Falling back to database queries for complaints");
}

// CORS configuration - MUST be first!
app.use(
  cors({
    origin: true, // Allow all origins in development
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// Handle preflight requests
app.options("*", cors());

// Add CORS headers to all responses
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Parse JSON bodies
app.use(express.json());

// Language validation function
const validateLanguage = (language) => {
  // Check if language is provided and is a string
  if (!language || typeof language !== "string") {
    return { valid: false, error: "Language parameter is required" };
  }

  // Check if language length is exactly 2 characters
  if (language.length !== 2) {
    return {
      valid: false,
      error: "Language code must be exactly 2 characters",
    };
  }

  // Check if language exists in supported languages (O(1) lookup)
  if (!supportedLanguages[language]) {
    return { valid: false, error: "we don't have this language yet" };
  }

  return { valid: true };
};

app.get("/", (req, res) => {
  res.json({ message: "Express backend running" });
});

const wardCache = new Map();

// Cache TTL: 5 minutes for general data, but ward data NEVER expires
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const WARD_CACHE_TTL = Number.MAX_SAFE_INTEGER; // Effectively never expires - stays in memory indefinitely

// Memory protection limits
const MAX_CACHE_ENTRIES = 1000;
const MAX_CACHE_SIZE_MB = 100;
const MAX_ENTRY_SIZE_KB = 50;

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

  console.log(`\n=== CACHE GET ===`);
  console.log(
    `Key: ${key} | Requested as: ${isWardData ? "WARD" : "GENERAL"} data`
  );
  if (cacheEntry) {
    console.log(
      `Found entry: isWardData: ${cacheEntry.isWardData} | timestamp: ${cacheEntry.timestamp}`
    );
  } else {
    console.log(`No entry found`);
  }

  if (isCacheValid(cacheEntry, isWardData)) {
    console.log(
      `Cache HIT for key: ${key} (${isWardData ? "WARD" : "GENERAL"} data)`
    );
    return cacheEntry.data;
  }

  if (cacheEntry) {
    console.log(
      `Cache EXPIRED for key: ${key} (${isWardData ? "WARD" : "GENERAL"} data)`
    );
    wardCache.delete(key);
  }

  console.log(
    `Cache MISS for key: ${key} (${isWardData ? "WARD" : "GENERAL"} data)`
  );
  console.log(`=== CACHE GET END ===\n`);
  return null;
};

// Helper function to set cache
const setCache = (city, ward_no, language, data, isWardData = false) => {
  const key = generateCacheKey(city, ward_no, language);

  // Check entry size limit
  const entrySizeKB = getEntrySizeKB(data);
  if (entrySizeKB > MAX_ENTRY_SIZE_KB) {
    console.log(
      `Cache entry too large (${entrySizeKB.toFixed(
        2
      )} KB > ${MAX_ENTRY_SIZE_KB} KB). Skipping cache.`
    );
    return false;
  }

  // Check cache size limits
  const currentSizeMB = getCacheSizeMB();
  if (currentSizeMB + entrySizeKB / 1024 > MAX_CACHE_SIZE_MB) {
    console.log(
      `Cache would exceed size limit (${currentSizeMB.toFixed(2)} MB + ${(
        entrySizeKB / 1024
      ).toFixed(2)} MB > ${MAX_CACHE_SIZE_MB} MB). Clearing old entries.`
    );
    clearOldestEntries(10); // Clear 10 oldest entries
  }

  // Check entry count limit
  if (wardCache.size >= MAX_CACHE_ENTRIES) {
    console.log(
      `Cache would exceed entry limit (${wardCache.size} >= ${MAX_CACHE_ENTRIES}). Clearing old entries.`
    );
    clearOldestEntries(10); // Clear 10 oldest entries
  }

  wardCache.set(key, {
    data: data,
    timestamp: Date.now(),
    isWardData: isWardData, // Mark this as ward data
  });

  // Explicit debugging to verify the flag is set
  console.log(`\n=== CACHE SET DEBUG ===`);
  console.log(`Key: ${key}`);
  console.log(`isWardData parameter: ${isWardData}`);
  console.log(`Entry size: ${entrySizeKB.toFixed(2)} KB`);
  console.log(
    `Cache entry created with isWardData: ${wardCache.get(key).isWardData}`
  );
  console.log(`=== CACHE SET DEBUG END ===\n`);

  console.log(
    `Cache SET for key: ${key} (${entrySizeKB.toFixed(2)} KB, ${
      isWardData ? "WARD" : "GENERAL"
    } data) | isWardData: ${isWardData}`
  );
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
    console.log(`Cleared old cache entry: ${key}`);
  }

  if (entriesToClear > 0) {
    console.log(
      `Cleared ${entriesToClear} old cache entries (WARD data preserved - never expires)`
    );
  } else {
    console.log(
      `No non-ward entries to clear. WARD data is preserved indefinitely.`
    );
  }
};

// Helper function to clear expired cache entries
const cleanupExpiredCache = () => {
  const now = Date.now();
  let cleanedCount = 0;
  let wardDataCount = 0;
  let generalDataCount = 0;

  console.log(`\n=== CACHE CLEANUP START ===`);
  console.log(`Total cache entries: ${wardCache.size}`);

  for (const [key, entry] of wardCache.entries()) {
    console.log(
      `Entry: ${key} | isWardData: ${entry.isWardData} | timestamp: ${
        entry.timestamp
      } | age: ${((now - entry.timestamp) / 1000 / 60).toFixed(2)} minutes`
    );

    if (entry.isWardData) {
      wardDataCount++;
      console.log(`  → WARD DATA: Never expires, preserving`);
    } else {
      generalDataCount++;
      if (now - entry.timestamp > CACHE_TTL) {
        wardCache.delete(key);
        console.log(`  → GENERAL DATA: Expired, cleaning up`);
        cleanedCount++;
      } else {
        console.log(`  → GENERAL DATA: Still valid, preserving`);
      }
    }
  }

  console.log(`\n=== CACHE CLEANUP SUMMARY ===`);
  console.log(`Ward data entries: ${wardDataCount} (preserved)`);
  console.log(
    `General data entries: ${generalDataCount} (${cleanedCount} cleaned, ${
      generalDataCount - cleanedCount
    } preserved)`
  );

  if (cleanedCount > 0) {
    console.log(
      `Cleanup completed: ${cleanedCount} expired GENERAL entries removed. WARD data preserved.`
    );
  } else {
    console.log(
      `Cleanup completed: No expired entries found. WARD data preserved indefinitely.`
    );
  }
  console.log(`=== CACHE CLEANUP END ===\n`);
};

// Clean up expired cache entries every 10 minutes
setInterval(cleanupExpiredCache, 10 * 60 * 1000);

// Cache management routes
app.get("/api/cache/stats", (req, res) => {
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

  res.json({
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
  });
});

app.post("/api/cache/clear", (req, res) => {
  const beforeSize = wardCache.size;
  wardCache.clear();
  console.log(`Cache cleared. Removed ${beforeSize} entries.`);
  res.json({
    message: "Cache cleared successfully",
    entries_removed: beforeSize,
  });
});

app.post("/api/cache/clear-expired", (req, res) => {
  const beforeSize = wardCache.size;
  cleanupExpiredCache();
  const afterSize = wardCache.size;
  const removed = beforeSize - afterSize;
  console.log(`Expired cache entries cleared. Removed ${removed} entries.`);
  res.json({
    message: "Expired cache entries cleared",
    entries_removed: removed,
    remaining_entries: afterSize,
  });
});

app.get("/api/fetchWardWithLocation", async (req, res) => {
  try {
    const { lat, lon, language = "en" } = req.query;

    // Validate language parameter
    const languageValidation = validateLanguage(language);
    if (!languageValidation.valid) {
      return res.status(404).json({ error: languageValidation.error });
    }

    // Map 'hi' to 'hn' for Hindi translations since our seed data uses 'hn'
    const effectiveLanguage = language === "hi" ? "hn" : language;

    if (!lat || !lon) {
      return res.status(400).json({ error: "lat and lon are required" });
    }

    // Find the ward geometry that contains the given coordinates
    // For now, we'll use a simple approach - find the first ward with geometry
    // In a real implementation, you would use PostGIS ST_Contains or similar spatial queries
    const wardGeom = await prisma.ward_geom.findFirst({
      where: {
        city: {
          equals: "Delhi",
          mode: "insensitive",
        },
        geom: {
          not: null,
        },
      },
      orderBy: {
        gid: "asc",
      },
    });

    if (!wardGeom) {
      return res.status(404).json({ error: "No ward geometry found" });
    }

    const cityName = wardGeom.city;
    const wardNo = wardGeom.ward_no;

    // Check cache first
    const cachedData = getFromCache(cityName, wardNo, effectiveLanguage, true);
    if (cachedData) {
      console.log(
        `Serving from cache for fetchWardWithLocation with key: ${generateCacheKey(
          cityName,
          wardNo,
          effectiveLanguage
        )}`
      );
      return res.json(cachedData);
    }

    // Try to find city by name, but if there are multiple matches, prefer the one with more wards
    let cityRecord = await prisma.cities.findFirst({
      where: { name: cityName },
      include: {
        translations: {
          where: { language: effectiveLanguage },
        },
        _count: {
          select: { wards: true },
        },
      },
    });

    // If multiple cities with same name, find the one with the most wards
    if (cityRecord) {
      const allCitiesWithSameName = await prisma.cities.findMany({
        where: { name: cityName },
        include: {
          translations: {
            where: { language: effectiveLanguage },
          },
          _count: {
            select: { wards: true },
          },
        },
      });

      if (allCitiesWithSameName.length > 1) {
        // Sort by number of wards descending and take the first
        allCitiesWithSameName.sort((a, b) => b._count.wards - a._count.wards);
        cityRecord = allCitiesWithSameName[0];
      }
    }

    if (!cityRecord) {
      return res.status(404).json({ error: "City not found" });
    }

    const wardRecord = await prisma.wards.findFirst({
      where: {
        city_id: cityRecord.id,
        ward_no: parseInt(wardNo),
      },
      include: {
        translations: {
          where: { language: effectiveLanguage },
        },
      },
    });

    if (!wardRecord) {
      return res.status(404).json({ error: "Ward not found" });
    }

    // Get all departments for the city
    const allDepartments = await prisma.departments.findMany({
      where: {
        city_id: cityRecord.id,
        is_active: true,
      },
      include: {
        translations: {
          where: { language: effectiveLanguage },
        },
      },
    });

    // Filter out IT, ADMIN, ACCOUNTS departments
    const excludedDepartments = ["it", "admin", "accounts", "administration"];
    const filteredDepartments = allDepartments.filter(
      (dept) => !excludedDepartments.includes(dept.code.toLowerCase())
    );

    // Get departments with officials and complaints
    const departmentsWithData = await Promise.all(
      filteredDepartments.map(async (dept) => {
        // Get officials for this department in this ward
        const officials = await prisma.official.findMany({
          where: {
            city_id: cityRecord.id,
            ward_id: wardRecord.id,
            department_id: dept.id,
            is_active: true,
          },
          include: {
            designation: {
              include: {
                translations: {
                  where: { language: effectiveLanguage },
                },
              },
            },
            translations: {
              where: { language: effectiveLanguage },
            },
          },
        });

        // Get complaints for this department with intelligent mapping
        let complaints = [];

        // Map complaints based on department similarity
        if (dept.code === "health_section" || dept.code === "health") {
          // Health-related complaints
          complaints = await prisma.complaints.findMany({
            where: {
              complaint_category: {
                department_id: 20, // health department
              },
              is_active: true,
            },
            include: {
              translations: {
                where: { language: effectiveLanguage },
              },
              complaint_category: {
                include: {
                  translations: {
                    where: { language: effectiveLanguage },
                  },
                },
              },
            },
            orderBy: {
              priority: "asc",
            },
          });
        } else if (
          dept.code === "technical_section" ||
          dept.code === "technical"
        ) {
          // Technical complaints (infrastructure, roads, etc.)
          complaints = await prisma.complaints.findMany({
            where: {
              complaint_category: {
                department_id: 20, // health department (for now, as it has most categories)
                code: {
                  in: [
                    "road_maintenance",
                    "street_light",
                    "electrical",
                    "building_construction",
                    "underground_drainage",
                  ],
                },
              },
              is_active: true,
            },
            include: {
              translations: {
                where: { language: effectiveLanguage },
              },
              complaint_category: {
                include: {
                  translations: {
                    where: { language: effectiveLanguage },
                  },
                },
              },
            },
            orderBy: {
              priority: "asc",
            },
          });
        } else if (dept.code === "revenue_section" || dept.code === "revenue") {
          // Revenue-related complaints
          complaints = await prisma.complaints.findMany({
            where: {
              complaint_category: {
                department_id: 20, // health department (for now)
                code: {
                  in: ["voter_id", "property_tax", "water_tax"],
                },
              },
              is_active: true,
            },
            include: {
              translations: {
                where: { language: effectiveLanguage },
              },
              complaint_category: {
                include: {
                  translations: {
                    where: { language: effectiveLanguage },
                  },
                },
              },
            },
            orderBy: {
              priority: "asc",
            },
          });
        } else if (dept.code === "day_nulm_section" || dept.code === "nulm") {
          // NULM-related complaints
          complaints = await prisma.complaints.findMany({
            where: {
              complaint_category: {
                department_id: 20, // health department (for now)
                code: {
                  in: [
                    "social_welfare",
                    "livelihood_support",
                    "community_development",
                  ],
                },
              },
              is_active: true,
            },
            include: {
              translations: {
                where: { language: effectiveLanguage },
              },
              complaint_category: {
                include: {
                  translations: {
                    where: { language: effectiveLanguage },
                  },
                },
              },
            },
            orderBy: {
              priority: "asc",
            },
          });
        } else if (dept.code === "water_supply") {
          // Water supply complaints
          complaints = await prisma.complaints.findMany({
            where: {
              complaint_category: {
                department_id: 20, // health department (for now)
                code: {
                  in: [
                    "water_supply_main",
                    "water_quality",
                    "water_connection",
                  ],
                },
              },
              is_active: true,
            },
            include: {
              translations: {
                where: { language: effectiveLanguage },
              },
              complaint_category: {
                include: {
                  translations: {
                    where: { language: effectiveLanguage },
                  },
                },
              },
            },
            orderBy: {
              priority: "asc",
            },
          });
        } else if (dept.code === "housing") {
          // Housing complaints
          complaints = await prisma.complaints.findMany({
            where: {
              complaint_category: {
                department_id: 20, // health department (for now)
                code: {
                  in: ["general_housing", "building_permit", "house_repair"],
                },
              },
              is_active: true,
            },
            include: {
              translations: {
                where: { language: effectiveLanguage },
              },
              complaint_category: {
                include: {
                  translations: {
                    where: { language: effectiveLanguage },
                  },
                },
              },
            },
            orderBy: {
              priority: "asc",
            },
          });
        }

        // Group officials by designation
        const designationsMap = {};
        officials.forEach((official) => {
          const designationCode = official.designation_code;
          const designationTitle =
            official.designation.translations[0]?.title || designationCode;

          if (!designationsMap[designationCode]) {
            designationsMap[designationCode] = {
              code: designationCode,
              title: designationTitle,
              officers: [],
            };
          }

          const officerData = {
            id: official.id,
            name: official.translations[0]?.name || official.name,
            address: official.translations[0]?.address || official.address,
            phone_number: official.phone_number,
            email: official.email,
            party: official.party,
            pincode: official.pincode,
          };

          designationsMap[designationCode].officers.push(officerData);
        });

        const designations = Object.values(designationsMap);

        // Format complaints with categories
        const formattedComplaints = complaints.map((complaint) => ({
          id: complaint.id,
          code: complaint.code,
          priority: complaint.priority,
          is_active: complaint.is_active,
          title: complaint.translations[0]?.title || complaint.code,
          category: {
            id: complaint.complaint_category.id,
            code: complaint.complaint_category.code,
            name:
              complaint.complaint_category.translations[0]?.name ||
              complaint.complaint_category.name,
            description:
              complaint.complaint_category.translations[0]?.description,
            color: complaint.complaint_category.color,
            priority: complaint.complaint_category.priority,
          },
        }));

        return {
          id: dept.id,
          code: dept.code,
          name: dept.translations[0]?.name || dept.code,
          description: dept.translations[0]?.description,
          designations,
          complaints: formattedComplaints,
          complaints_count: formattedComplaints.length,
        };
      })
    );

    // Only include departments that have designations (officials assigned)
    const departmentsWithOfficials = departmentsWithData.filter(
      (dept) => dept.designations.length > 0
    );

    const wardInfo = {
      city: cityRecord.translations[0]?.name || cityName,
      ward_no: parseInt(wardNo),
      ward_name:
        wardRecord.translations[0]?.name || wardRecord.name || `Ward ${wardNo}`,
    };

    const response = {
      departments: departmentsWithOfficials,
      ward_info: wardInfo,
      total_departments: departmentsWithOfficials.length,
      total_complaints: departmentsWithOfficials.reduce(
        (sum, dept) => sum + dept.complaints_count,
        0
      ),
    };

    setCache(cityName, wardNo, effectiveLanguage, response, true);
    res.json(response);
  } catch (error) {
    console.error("Error fetching ward with location:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/ward-boundaries", async (req, res) => {
  try {
    const { north, south, east, west, city } = req.query;

    if (!north || !south || !east || !west || !city) {
      return res
        .status(400)
        .json({ error: "north, south, east, west, and city are required" });
    }

    console.log(
      `Fetching ward boundaries for city: ${city}, bounds: ${north},${south},${east},${west}`
    );

    // First, try to get all wards for the city
    const wardBoundaries = await prisma.ward_geom.findMany({
      where: {
        city: {
          equals: city,
          mode: "insensitive",
        },
        geom: {
          not: null,
        },
      },
      select: {
        ward_no: true,
        ward_name: true,
        geom: true,
      },
    });

    console.log(`Found ${wardBoundaries.length} wards for city: ${city}`);

    // Filter wards based on bounding box if we have geometry data
    let filteredBoundaries = wardBoundaries;

    if (wardBoundaries.length > 0) {
      // For now, we'll return all wards for the city since we don't have proper spatial queries
      // In a production environment, you would use PostGIS ST_Intersects or similar
      filteredBoundaries = wardBoundaries.filter((ward) => {
        // Just check if geometry exists - the WKB to GeoJSON conversion will handle validation
        return ward.geom && ward.geom.length > 0;
      });
    }

    const boundaries = filteredBoundaries.map((ward) => {
      let geoJson = null;

      if (ward.geom) {
        try {
          // Convert WKB to GeoJSON
          const buffer = Buffer.from(ward.geom, "hex");
          const geometry = wkx.Geometry.parse(buffer);
          geoJson = geometry.toGeoJSON();
        } catch (error) {
          console.error(
            `Error converting geometry for ward ${ward.ward_no}:`,
            error
          );
        }
      }

      return {
        ward_no: ward.ward_no,
        ward_name: ward.ward_name,
        geometry: geoJson,
      };
    });

    console.log(`Returning ${boundaries.length} ward boundaries`);
    res.json(boundaries);
  } catch (error) {
    console.error("Error fetching ward boundaries:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/fetchIssue", async (req, res) => {
  try {
    const { issueId, language = "en" } = req.query;

    console.log(`Fetching issue ${issueId} in language: ${language}`);

    if (!issueId) {
      return res.status(400).json({ error: "issueId is required" });
    }

    const issue = await prisma.issues.findFirst({
      where: { issueId: issueId },
      include: {
        ward: true,
        department: true,
        assigned_official: true,
      },
    });

    if (!issue) {
      return res.status(404).json({ error: "Issue not found" });
    }

    console.log("Base language values from database:");
    console.log("- City:", issue.city);
    console.log("- Ward:", issue.ward_name);
    console.log("- Department:", issue.category);
    console.log("- Designation:", issue.designation);

    let cityName = issue.city;
    let wardName = issue.ward_name;
    let departmentName = issue.category;
    let designationName = issue.designation;

    if (language !== "en") {
      console.log(`Looking for translations in language: ${language}`);
      try {
        if (issue.ward?.city) {
          const cityTranslation = await prisma.city_translations.findFirst({
            where: {
              city_id: issue.ward.city_id,
              language: language,
            },
          });
          if (cityTranslation) {
            cityName = cityTranslation.name;
            console.log(`City translation found: ${cityName}`);
          }
        }

        if (issue.ward) {
          const wardTranslation = await prisma.ward_translations.findFirst({
            where: {
              ward_id: issue.ward.id,
              language: language,
            },
          });
          if (wardTranslation) {
            wardName = wardTranslation.name;
            console.log(`Ward translation found: ${wardName}`);
          }
        }

        if (issue.department) {
          const deptTranslation =
            await prisma.department_translations.findFirst({
              where: {
                department_id: issue.department.id,
                language: language,
              },
            });
          if (deptTranslation) {
            departmentName = deptTranslation.name;
            console.log(`Department translation found: ${departmentName}`);
          }
        }

        if (issue.designation) {
          const desigTranslation =
            await prisma.designation_translations.findFirst({
              where: {
                code: issue.designation,
              },
            });

          if (desigTranslation) {
            const userLanguageTranslation =
              await prisma.designation_translations.findFirst({
                where: {
                  code: issue.designation,
                  language: language,
                },
              });

            designationName =
              userLanguageTranslation?.title || desigTranslation.title;
            console.log(`Designation translation found: ${designationName}`);
          }
        }
      } catch (translationError) {
        console.log("Translation lookup failed, using base language");
      }
    }

    console.log("Final values being returned:");
    console.log("- City:", cityName);
    console.log("- Ward:", wardName);
    console.log("- Department:", departmentName);
    console.log("- Designation:", designationName);

    const response = {
      ...issue,
      city: cityName,
      ward_name: wardName,
      department: departmentName,
      designation: designationName,
      base_language: {
        city: issue.city,
        ward_name: issue.ward_name,
        department: issue.category,
        designation: issue.designation,
      },
    };

    res.json(response);
  } catch (error) {
    console.error("Error fetching issue:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/debug/translations", async (req, res) => {
  try {
    const { language = "hi" } = req.query;

    console.log(`Debug: Checking translations for language: ${language}`);

    const cityTranslations = await prisma.city_translations.findMany({
      where: { language },
      include: { city: true },
    });

    const wardTranslations = await prisma.ward_translations.findMany({
      where: { language },
      include: { ward: true },
    });

    const deptTranslations = await prisma.department_translations.findMany({
      where: { language },
      include: { department: true },
    });

    const desigTranslations = await prisma.designation_translations.findMany({
      where: { language },
      include: { designation: true },
    });

    res.json({
      language,
      city_translations: cityTranslations,
      ward_translations: wardTranslations,
      department_translations: deptTranslations,
      designation_translations: desigTranslations,
    });
  } catch (error) {
    console.error("Debug translation error:", error);
    res.status(500).json({ error: "Debug failed" });
  }
});

app.get("/api/debug/city/:cityName", async (req, res) => {
  try {
    const { cityName } = req.params;
    console.log(`Debug: Looking for city: ${cityName}`);

    const cityRecord = await prisma.cities.findFirst({
      where: {
        name: {
          equals: cityName,
          mode: "insensitive",
        },
      },
    });

    if (!cityRecord) {
      return res.status(404).json({ error: "City not found" });
    }

    const cityTranslations = await prisma.city_translations.findMany({
      where: { city_id: cityRecord.id },
    });

    res.json({
      city: cityRecord,
      translations: cityTranslations,
    });
  } catch (error) {
    console.error("Debug city error:", error);
    res.status(500).json({ error: "Debug failed" });
  }
});

app.get("/api/debug/cities", async (req, res) => {
  try {
    const cities = await prisma.cities.findMany({
      select: { id: true, name: true },
    });

    res.json({ cities });
  } catch (error) {
    console.error("Debug cities error:", error);
    res.status(500).json({ error: "Debug failed" });
  }
});

app.post("/api/createIssue", async (req, res) => {
  try {
    const {
      description,
      priority,
      city,
      ward_no,
      official_name,
      official_designation,
      official_department,
      message,
      location,
      category,
      department_id,
      language = "en",
    } = req.body;

    // Validate language parameter
    const languageValidation = validateLanguage(language);
    if (!languageValidation.valid) {
      return res.status(404).json({ error: languageValidation.error });
    }

    console.log("Received issue data:", req.body);
    console.log(`Creating issue in language: ${language}`);
    console.log(
      `Language parameter type: ${typeof language}, value: "${language}"`
    );

    const userLanguage =
      language && typeof language === "string"
        ? language.trim().toLowerCase()
        : "en";
    console.log(`Using language: "${userLanguage}"`);

    let normalizedLanguage = userLanguage;
    if (
      userLanguage === "hi" ||
      userLanguage === "hindi" ||
      userLanguage === "हिंदी"
    ) {
      normalizedLanguage = "hi";
    } else if (
      userLanguage === "en" ||
      userLanguage === "english" ||
      userLanguage === "English"
    ) {
      normalizedLanguage = "en";
    }
    console.log(`Normalized language: "${normalizedLanguage}"`);

    const issueDescription = description || message;

    if (!issueDescription) {
      return res.status(400).json({ error: "Description/message is required" });
    }

    if (!city) {
      return res.status(400).json({ error: "City is required" });
    }

    if (!ward_no) {
      return res.status(400).json({ error: "Ward number is required" });
    }

    const cleanCity = city.trim();
    console.log("Looking for city:", cleanCity);
    console.log("City parameter received:", city);
    console.log("City parameter type:", typeof city);

    let cityRecord = await prisma.cities.findFirst({
      where: {
        name: {
          equals: cleanCity,
          mode: "insensitive",
        },
      },
    });

    if (!cityRecord) {
      console.log("City not found with exact match, trying variations...");

      const firstWord = cleanCity.split(" ")[0];
      cityRecord = await prisma.cities.findFirst({
        where: {
          name: {
            contains: firstWord,
            mode: "insensitive",
          },
        },
      });

      if (cityRecord) {
        console.log(`Found city with partial match: ${cityRecord.name}`);
      }
    }

    console.log("City record found:", cityRecord);

    if (!cityRecord) {
      console.log("City not found in database. Available cities:");
      const allCities = await prisma.cities.findMany({
        select: { name: true },
      });
      console.log(
        "Available cities:",
        allCities.map((c) => c.name)
      );

      return res.status(404).json({
        error: "City not found",
        receivedCity: cleanCity,
        availableCities: allCities.map((c) => c.name),
      });
    }

    const wardRecord = await prisma.wards.findFirst({
      where: {
        city_id: cityRecord.id,
        ward_no: parseInt(ward_no),
      },
    });

    if (!wardRecord) {
      return res.status(404).json({ error: "Ward not found" });
    }

    let departmentName = null;
    let designationTitle = null;

    if (department_id) {
      const departmentRecord = await prisma.departments.findFirst({
        where: { id: parseInt(department_id) },
        include: {
          translations: {
            where: { language: "en" },
          },
        },
      });

      if (departmentRecord) {
        departmentName =
          departmentRecord.translations[0]?.name || departmentRecord.code;
      }
    }

    if (official_designation) {
      const designationRecord = await prisma.designations.findFirst({
        where: { code: official_designation },
      });

      if (designationRecord) {
        designationTitle = official_designation;
        console.log(`Found designation by code: ${designationTitle}`);
      } else {
        const designationByTitle =
          await prisma.designation_translations.findFirst({
            where: {
              title: official_designation,
            },
            include: {
              designation: true,
            },
          });

        if (designationByTitle) {
          designationTitle = designationByTitle.designation.code;
          console.log(`Found designation code from title: ${designationTitle}`);
        } else {
          console.log(
            `Could not find designation for: ${official_designation}`
          );
        }
      }
    }

    const issueId = Math.random().toString(36).substring(2, 14).toUpperCase();

    const baseLanguageCity = cityRecord.name;
    const baseLanguageWardName = wardRecord.name || `Ward ${ward_no}`;
    const baseLanguageDepartment = departmentName || "Unknown Department";
    const baseLanguageDesignation = designationTitle || "Unknown Designation";

    console.log("Storing issue with base language values:");
    console.log("- City:", baseLanguageCity);
    console.log("- Ward:", baseLanguageWardName);
    console.log("- Department:", baseLanguageDepartment);
    console.log("- Designation:", baseLanguageDesignation);

    const issue = await prisma.issues.create({
      data: {
        ward_id: wardRecord.id,
        department_id: department_id ? parseInt(department_id) : null,
        ip: req.ip || "unknown",
        message: issueDescription,
        issueId: issueId,
        priority: priority || "medium",
        category: baseLanguageDepartment,
        location: location || null,
        city: baseLanguageCity,
        ward_name: baseLanguageWardName,
        designation: baseLanguageDesignation,
        assigned_official_id: null,
      },
    });

    let responseCity = baseLanguageCity;
    let responseWardName = baseLanguageWardName;
    let responseDepartment = baseLanguageDepartment;
    let responseDesignation = baseLanguageDesignation;

    if (normalizedLanguage !== "en") {
      console.log(
        `Getting translations for response in language: ${normalizedLanguage}`
      );
      console.log(
        `Language type: ${typeof normalizedLanguage}, value: "${normalizedLanguage}"`
      );
      try {
        console.log(
          `Looking for city translation for city_id: ${cityRecord.id}, language: ${normalizedLanguage}`
        );
        console.log(`City record:`, cityRecord);

        const cityTranslation = await prisma.city_translations.findFirst({
          where: {
            city_id: cityRecord.id,
            language: normalizedLanguage,
          },
        });
        console.log(`City translation found:`, cityTranslation);

        const allCityTranslations = await prisma.city_translations.findMany({
          where: { city_id: cityRecord.id },
        });
        console.log(
          `All city translations for city_id ${cityRecord.id}:`,
          allCityTranslations
        );

        if (cityTranslation) {
          responseCity = cityTranslation.name;
          console.log(`City response translation: ${responseCity}`);
        } else {
          console.log(
            `No city translation found for language: ${normalizedLanguage}`
          );
        }

        console.log(
          `Looking for ward translation for ward_id: ${wardRecord.id}, language: ${normalizedLanguage}`
        );
        const wardTranslation = await prisma.ward_translations.findFirst({
          where: {
            ward_id: wardRecord.id,
            language: normalizedLanguage,
          },
        });
        console.log(`Ward translation found:`, wardTranslation);
        if (wardTranslation) {
          responseWardName = wardTranslation.name;
          console.log(`Ward response translation: ${responseWardName}`);
        } else {
          console.log(
            `No ward translation found for language: ${normalizedLanguage}`
          );
        }

        if (department_id) {
          console.log(
            `Looking for department translation for department_id: ${department_id}, language: ${normalizedLanguage}`
          );
          const deptTranslation =
            await prisma.department_translations.findFirst({
              where: {
                department_id: parseInt(department_id),
                language: normalizedLanguage,
              },
            });
          console.log(`Department translation found:`, deptTranslation);
          if (deptTranslation) {
            responseDepartment = deptTranslation.name;
            console.log(
              `Department response translation: ${responseDepartment}`
            );
          } else {
            console.log(
              `No department translation found for language: ${normalizedLanguage}`
            );
          }
        }

        if (designationTitle) {
          console.log(
            `Looking for designation translation for designationTitle: ${designationTitle}, language: ${normalizedLanguage}`
          );

          const desigTranslation =
            await prisma.designation_translations.findFirst({
              where: {
                code: designationTitle,
                language: normalizedLanguage,
              },
            });

          console.log(`Designation translation found:`, desigTranslation);

          const allDesigTranslations =
            await prisma.designation_translations.findMany({
              where: { code: designationTitle },
            });
          console.log(
            `All designation translations for code ${designationTitle}:`,
            allDesigTranslations
          );

          if (desigTranslation) {
            responseDesignation = desigTranslation.title;
            console.log(
              `Designation response translation: ${responseDesignation}`
            );
          } else {
            console.log(
              `No designation translation found for code: ${designationTitle}, language: ${normalizedLanguage}`
            );
          }
        }
      } catch (translationError) {
        console.log("Response translation lookup failed, using base language");
      }
    }

    console.log("Response values in user's language:");
    console.log("- City:", responseCity);
    console.log("- Ward:", responseWardName);
    console.log("- Department:", responseDepartment);
    console.log("- Designation:", responseDesignation);

    res.status(201).json({
      issueId: issue.issueId,
      message: "Issue created successfully",
      issue: {
        id: issue.id,
        issueId: issue.issueId,
        city: responseCity,
        ward_name: responseWardName,
        department: responseDepartment,
        designation: responseDesignation,
        message: issue.message,
        priority: issue.priority,
        created_at: issue.created_at,
      },
      stored_in_base_language: {
        city: baseLanguageCity,
        ward_name: baseLanguageWardName,
        department: baseLanguageDepartment,
        designation: baseLanguageDesignation,
      },
    });
  } catch (error) {
    console.error("Error creating issue:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Endpoint to fetch all departments with their complaints
app.get("/api/departments", async (req, res) => {
  try {
    const { language = "en" } = req.query;

    // Validate language parameter
    const languageValidation = validateLanguage(language);
    if (!languageValidation.valid) {
      return res.status(404).json({ error: languageValidation.error });
    }

    // Map 'hi' to 'hn' for Hindi translations since our seed data uses 'hn'
    const effectiveLanguage = language === "hi" ? "hn" : language;

    const response = {
      departments: {},
      total_departments: 0,
      total_complaints: 0,
    };

    // Use structured complaints data for O(1) lookup
    Object.keys(structuredComplaints).forEach((deptCode) => {
      if (structuredComplaints[deptCode][effectiveLanguage]) {
        const deptData = structuredComplaints[deptCode][effectiveLanguage];
        const deptName =
          departmentMapping[deptCode]?.[effectiveLanguage] || deptCode;

        response.departments[deptCode] = {
          code: deptCode,
          name: deptName,
          complaint_categories: deptData.complaint_categories,
          total_categories: deptData.complaint_categories.length,
          total_complaints: deptData.complaint_categories.reduce(
            (sum, cat) => sum + cat.complaints.length,
            0
          ),
        };

        response.total_departments++;
        response.total_complaints +=
          response.departments[deptCode].total_complaints;
      }
    });

    res.json(response);
  } catch (error) {
    console.error("Error fetching departments:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/fetchWard", async (req, res) => {
  try {
    const { ward_no, city, language = "en" } = req.query;

    // Validate language parameter
    const languageValidation = validateLanguage(language);
    if (!languageValidation.valid) {
      return res.status(404).json({ error: languageValidation.error });
    }

    // Map 'hi' to 'hn' for Hindi translations since our seed data uses 'hn'
    const effectiveLanguage = language === "hi" ? "hn" : language;

    if (!ward_no || !city) {
      return res.status(400).json({ error: "ward_no and city are required" });
    }

    // Check cache first (ward data never expires)
    const cachedData = getFromCache(city, ward_no, effectiveLanguage, true);
    if (cachedData) {
      console.log(
        `Serving from cache for fetchWard with key: ${generateCacheKey(
          city,
          ward_no,
          effectiveLanguage
        )}`
      );
      return res.json(cachedData);
    }

    // Try to find city by name, but if there are multiple matches, prefer the one with more wards
    let cityRecord = await prisma.cities.findFirst({
      where: { name: city },
      include: {
        translations: {
          where: { language: effectiveLanguage },
        },
        _count: {
          select: { wards: true },
        },
      },
    });

    // If multiple cities with same name, find the one with the most wards
    if (cityRecord) {
      const allCitiesWithSameName = await prisma.cities.findMany({
        where: { name: city },
        include: {
          translations: {
            where: { language: effectiveLanguage },
          },
          _count: {
            select: { wards: true },
          },
        },
      });

      if (allCitiesWithSameName.length > 1) {
        // Sort by number of wards descending and take the first
        allCitiesWithSameName.sort((a, b) => b._count.wards - a._count.wards);
        cityRecord = allCitiesWithSameName[0];
      }
    }

    if (!cityRecord) {
      return res.status(404).json({ error: "City not found" });
    }

    const wardRecord = await prisma.wards.findFirst({
      where: {
        city_id: cityRecord.id,
        ward_no: parseInt(ward_no),
      },
      include: {
        translations: {
          where: { language: effectiveLanguage },
        },
      },
    });

    if (!wardRecord) {
      return res.status(404).json({ error: "Ward not found" });
    }

    // Get all departments for the city
    const allDepartments = await prisma.departments.findMany({
      where: {
        city_id: cityRecord.id,
        is_active: true,
      },
      include: {
        translations: {
          where: { language: effectiveLanguage },
        },
      },
    });

    // Filter out IT, ADMIN, ACCOUNTS departments
    const excludedDepartments = ["it", "admin", "accounts", "administration"];
    const filteredDepartments = allDepartments.filter(
      (dept) => !excludedDepartments.includes(dept.code.toLowerCase())
    );

    // Get departments with officials and complaints
    const departmentsWithData = await Promise.all(
      filteredDepartments.map(async (dept) => {
        // Get officials for this department in this ward
        const officials = await prisma.official.findMany({
          where: {
            city_id: cityRecord.id,
            ward_id: wardRecord.id,
            department_id: dept.id,
            is_active: true,
          },
          include: {
            designation: {
              include: {
                translations: {
                  where: { language: effectiveLanguage },
                },
              },
            },
            translations: {
              where: { language: effectiveLanguage },
            },
          },
        });

        // Get complaints for this department using O(1) lookup from JSON
        let complaints = [];
        let complaintCategories = [];

        // Use structured complaints data for O(1) lookup
        if (
          structuredComplaints[dept.code] &&
          structuredComplaints[dept.code][effectiveLanguage]
        ) {
          complaintCategories =
            structuredComplaints[dept.code][effectiveLanguage]
              .complaint_categories;

          // Flatten all complaints from all categories
          complaintCategories.forEach((category) => {
            category.complaints.forEach((complaint) => {
              complaints.push({
                id: complaint.code, // Use code as ID since we don't have DB ID
                code: complaint.code,
                priority: 1, // Default priority
                is_active: true,
                title: complaint.title,
                category: {
                  id: category.code,
                  code: category.code,
                  name: category.name,
                  description: null,
                  color: null,
                  priority: 1,
                },
              });
            });
          });
        }

        // Group officials by designation
        const designationsMap = {};
        officials.forEach((official) => {
          const designationCode = official.designation_code;
          const designationTitle =
            official.designation.translations[0]?.title || designationCode;

          if (!designationsMap[designationCode]) {
            designationsMap[designationCode] = {
              code: designationCode,
              title: designationTitle,
              officers: [],
            };
          }

          const officerData = {
            id: official.id,
            name: official.translations[0]?.name || official.name,
            address: official.translations[0]?.address || official.address,
            phone_number: official.phone_number,
            email: official.email,
            party: official.party,
            pincode: official.pincode,
          };

          designationsMap[designationCode].officers.push(officerData);
        });

        const designations = Object.values(designationsMap);

        // Complaints are already formatted from the JSON lookup
        const formattedComplaints = complaints;

        return {
          id: dept.id,
          code: dept.code,
          name: dept.translations[0]?.name || dept.code,
          description: dept.translations[0]?.description,
          designations,
          complaints: formattedComplaints,
          complaints_count: formattedComplaints.length,
        };
      })
    );

    // Only include departments that have designations (officials assigned)
    const departmentsWithOfficials = departmentsWithData.filter(
      (dept) => dept.designations.length > 0
    );

    const wardInfo = {
      city: cityRecord.translations[0]?.name || city,
      ward_no: parseInt(ward_no),
      ward_name:
        wardRecord.translations[0]?.name ||
        wardRecord.name ||
        `Ward ${ward_no}`,
    };

    const response = {
      departments: departmentsWithOfficials,
      ward_info: wardInfo,
      total_departments: departmentsWithOfficials.length,
      total_complaints: departmentsWithOfficials.reduce(
        (sum, dept) => sum + dept.complaints_count,
        0
      ),
    };

    setCache(city, ward_no, effectiveLanguage, response, true);
    res.json(response);
  } catch (error) {
    console.error("Error fetching ward data:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
