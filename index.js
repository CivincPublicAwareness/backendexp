const express = require("express");
const { PrismaClient } = require("@prisma/client");
const cors = require("cors");
const wkx = require("wkx");

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

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

app.get("/", (req, res) => {
  res.json({ message: "Express backend running" });
});

const wardCache = new Map();

const CACHE_TTL = 5 * 60 * 1000;

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
const isCacheValid = (cacheEntry) => {
  return cacheEntry && Date.now() - cacheEntry.timestamp < CACHE_TTL;
};

// Helper function to get from cache
const getFromCache = (city, ward_no, language) => {
  const key = generateCacheKey(city, ward_no, language);
  const cacheEntry = wardCache.get(key);

  if (isCacheValid(cacheEntry)) {
    console.log(`Cache HIT for key: ${key}`);
    return cacheEntry.data;
  }

  if (cacheEntry) {
    console.log(`Cache EXPIRED for key: ${key}`);
    wardCache.delete(key);
  }

  console.log(`Cache MISS for key: ${key}`);
  return null;
};

// Helper function to set cache
const setCache = (city, ward_no, language, data) => {
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
  });
  console.log(`Cache SET for key: ${key} (${entrySizeKB.toFixed(2)} KB)`);
  return true;
};

// Helper function to clear oldest cache entries
const clearOldestEntries = (count) => {
  const entries = Array.from(wardCache.entries());
  entries.sort((a, b) => a[1].timestamp - b[1].timestamp); // Sort by timestamp (oldest first)

  const toRemove = entries.slice(0, count);
  toRemove.forEach(([key]) => {
    wardCache.delete(key);
    console.log(`Cleared old cache entry: ${key}`);
  });

  console.log(`Cleared ${toRemove.length} oldest cache entries`);
};

// Helper function to clear expired cache entries
const cleanupExpiredCache = () => {
  const now = Date.now();
  for (const [key, entry] of wardCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      wardCache.delete(key);
      console.log(`Cleaned up expired cache entry: ${key}`);
    }
  }
};

// Clean up expired cache entries every 10 minutes
setInterval(cleanupExpiredCache, 10 * 60 * 1000);

// Cache management routes
app.get("/api/cache/stats", (req, res) => {
  const now = Date.now();
  let validEntries = 0;
  let expiredEntries = 0;

  for (const [key, entry] of wardCache.entries()) {
    if (now - entry.timestamp < CACHE_TTL) {
      validEntries++;
    } else {
      expiredEntries++;
    }
  }

  const currentSizeMB = getCacheSizeMB();

  res.json({
    total_entries: wardCache.size,
    valid_entries: validEntries,
    expired_entries: expiredEntries,
    cache_ttl_minutes: CACHE_TTL / (60 * 1000),
    memory_usage: {
      current_mb: currentSizeMB.toFixed(2),
      max_mb: MAX_CACHE_SIZE_MB,
      usage_percent: ((currentSizeMB / MAX_CACHE_SIZE_MB) * 100).toFixed(2),
    },
    entry_limits: {
      current: wardCache.size,
      max: MAX_CACHE_ENTRIES,
      max_entry_size_kb: MAX_ENTRY_SIZE_KB,
    },
    cache_keys: Array.from(wardCache.keys()),
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

    const cityName = wardGeom.city || "Delhi";
    const wardNo = wardGeom.ward_no || 1;

    // Check cache first
    const cachedData = getFromCache(cityName, wardNo, effectiveLanguage);
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

    const departments = await prisma.departments.findMany({
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

    const departmentsWithOfficials = await Promise.all(
      departments.map(async (dept) => {
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

        return {
          id: dept.id,
          code: dept.code,
          name: dept.translations[0]?.name || dept.code,
          description: dept.translations[0]?.description,
          designations,
        };
      })
    );

    const filteredDepartments = departmentsWithOfficials.filter(
      (dept) => dept.designations.length > 0
    );

    const wardInfo = {
      city: cityRecord.translations[0]?.name || cityName,
      ward_no: parseInt(wardNo),
      ward_name:
        wardRecord.translations[0]?.name || wardRecord.name || `Ward ${wardNo}`,
    };

    const response = {
      departments: filteredDepartments,
      ward_info: wardInfo,
    };

    setCache(cityName, wardNo, effectiveLanguage, response);
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

app.get("/api/fetchWard", async (req, res) => {
  try {
    const { ward_no, city, language = "en" } = req.query;

    // Map 'hi' to 'hn' for Hindi translations since our seed data uses 'hn'
    const effectiveLanguage = language === "hi" ? "hn" : language;

    if (!ward_no || !city) {
      return res.status(400).json({ error: "ward_no and city are required" });
    }

    const cachedData = getFromCache(city, ward_no, effectiveLanguage);
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

    const departments = await prisma.departments.findMany({
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

    const departmentsWithOfficials = await Promise.all(
      departments.map(async (dept) => {
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

        return {
          id: dept.id,
          code: dept.code,
          name: dept.translations[0]?.name || dept.code,
          description: dept.translations[0]?.description,
          designations,
        };
      })
    );

    const filteredDepartments = departmentsWithOfficials.filter(
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
      departments: filteredDepartments,
      ward_info: wardInfo,
    };

    setCache(city, ward_no, effectiveLanguage, response);
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
