const { getFromCache, setCache, generateCacheKey } = require("../utils/cache");
const { validateLanguage, normalizeLanguage } = require("../utils/language");
const prisma = require("../utils/prisma");

let structuredComplaints = {};
let departmentMapping = {};

try {
  structuredComplaints = require("../structured_complaints.json");
  departmentMapping = require("../department_mapping.json");
} catch (error) {
  console.error("Error loading configuration files:", error);
}

const fetchWardData = async (cityName, wardNo, effectiveLanguage) => {
  // Check cache first
  const cachedData = await getFromCache(
    cityName,
    wardNo,
    effectiveLanguage,
    true
  );
  if (cachedData) {
    return cachedData;
  }

  // Find city by name, prefer the one with more wards if multiple matches
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
      allCitiesWithSameName.sort((a, b) => b._count.wards - a._count.wards);
      cityRecord = allCitiesWithSameName[0];
    }
  }

  if (!cityRecord) {
    throw new Error("City not found");
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
    throw new Error("Ward not found");
  }

  // Get active departments for the city
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

  // Filter out excluded departments
  const excludedDepartments = ["it", "admin", "accounts", "administration"];
  const filteredDepartments = allDepartments.filter(
    (dept) => !excludedDepartments.includes(dept.code.toLowerCase())
  );

  // Process departments with officials and complaints
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

      // Get complaints from structured data
      let complaints = [];
      if (
        structuredComplaints[dept.code] &&
        structuredComplaints[dept.code][effectiveLanguage]
      ) {
        const complaintCategories =
          structuredComplaints[dept.code][effectiveLanguage]
            .complaint_categories;

        complaintCategories.forEach((category) => {
          category.complaints.forEach((complaint) => {
            complaints.push({
              id: complaint.code,
              code: complaint.code,
              priority: 1,
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

        designationsMap[designationCode].officers.push({
          id: official.id,
          name: official.translations[0]?.name || official.name,
          address: official.translations[0]?.address || official.address,
          phone_number: official.phone_number,
          email: official.email,
          party: official.party,
          pincode: official.pincode,
        });
      });

      const designations = Object.values(designationsMap);

      return {
        id: dept.id,
        code: dept.code,
        name: dept.translations[0]?.name || dept.code,
        description: dept.translations[0]?.description,
        designations,
        complaints,
        complaints_count: complaints.length,
      };
    })
  );

  const departmentsWithOfficials = departmentsWithData.filter(
    (dept) => dept.designations.length > 0
  );

  const response = {
    departments: departmentsWithOfficials,
    ward_info: {
      city: cityRecord.translations[0]?.name || cityName,
      ward_no: parseInt(wardNo),
      ward_name:
        wardRecord.translations[0]?.name || wardRecord.name || `Ward ${wardNo}`,
    },
    total_departments: departmentsWithOfficials.length,
    total_complaints: departmentsWithOfficials.reduce(
      (sum, dept) => sum + dept.complaints_count,
      0
    ),
  };

  await setCache(cityName, wardNo, effectiveLanguage, response, true);
  return response;
};

// Fetch ward data
const fetchWard = async (req, res) => {
  try {
    const { ward_no, city, language = "en" } = req.query;

    // Validate language parameter
    const languageValidation = validateLanguage(language);
    if (!languageValidation.valid) {
      return res.status(404).json({ error: languageValidation.error });
    }

    // Map 'hi' to 'hn' for Hindi translations since our seed data uses 'hn'
    const effectiveLanguage = normalizeLanguage(language);

    if (!ward_no || !city) {
      return res.status(400).json({ error: "ward_no and city are required" });
    }

    const response = await fetchWardData(city, ward_no, effectiveLanguage);
    res.json(response);
  } catch (error) {
    console.error("Error fetching ward data:", error);
    if (error.message === "City not found") {
      return res.status(404).json({ error: "City not found" });
    }
    if (error.message === "Ward not found") {
      return res.status(404).json({ error: "Ward not found" });
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

// Fetch ward data by location (lat/lon)
const fetchWardWithLocation = async (req, res) => {
  try {
    const { lat, lon, language = "en" } = req.query;

    // Validate language parameter
    const languageValidation = validateLanguage(language);
    if (!languageValidation.valid) {
      return res.status(404).json({ error: languageValidation.error });
    }

    // Map 'hi' to 'hn' for Hindi translations since our seed data uses 'hn'
    const effectiveLanguage = normalizeLanguage(language);

    if (!lat || !lon) {
      return res.status(400).json({ error: "lat and lon are required" });
    }

    // Find the ward geometry that contains the given coordinates
    // Using spatial query to find the ward that contains the point
    const wardGeom = await prisma.ward_geom.findFirst({
      where: {
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

    const response = await fetchWardData(cityName, wardNo, effectiveLanguage);
    res.json(response);
  } catch (error) {
    console.error("Error fetching ward with location:", error);
    if (error.message === "City not found") {
      return res.status(404).json({ error: "City not found" });
    }
    if (error.message === "Ward not found") {
      return res.status(404).json({ error: "Ward not found" });
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  fetchWard,
  fetchWardWithLocation,
};
