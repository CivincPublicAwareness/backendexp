const structuredComplaints = require("../structured_complaints.json");
const prisma = require("./prisma");

/**
 * Get English names for complaint-related data from complaint code
 * @param {string} complaintCode - The complaint code (e.g., "sc_st_schemes")
 * @returns {Object} Object containing English names for complaint, department, etc.
 */
const getEnglishNamesFromComplaintCode = (complaintCode) => {
  if (!complaintCode) {
    return {
      complaint: null,
      department: null,
      departmentCode: null,
    };
  }

  // Search through all departments and their complaint categories
  for (const [departmentCode, departmentData] of Object.entries(
    structuredComplaints
  )) {
    if (departmentData.en && departmentData.en.complaint_categories) {
      for (const category of departmentData.en.complaint_categories) {
        if (category.complaints) {
          for (const complaint of category.complaints) {
            if (complaint.code === complaintCode) {
              return {
                complaint: complaint.title,
                department: category.name,
                departmentCode: departmentCode,
              };
            }
          }
        }
      }
    }
  }

  // If not found, return null values
  return {
    complaint: null,
    department: null,
    departmentCode: null,
  };
};

/**
 * Get English city name from various possible city names
 * @param {string} cityName - The city name in any language
 * @returns {string} English city name
 */
const getEnglishCityName = (cityName) => {
  if (!cityName) return null;

  // Common city mappings - you can expand this based on your data
  const cityMappings = {
    // Delhi variations
    delhi: "Delhi",
    दिल्ली: "Delhi",
    ದೆಹಲಿ: "Delhi",
    "new delhi": "Delhi",
    "नई दिल्ली": "Delhi",

    // Add more city mappings as needed
    mumbai: "Mumbai",
    मुंबई: "Mumbai",
    ಬೆಂಗಳೂರು: "Bangalore",
    bangalore: "Bangalore",
    bengaluru: "Bangalore",
  };

  const normalizedCity = cityName.toLowerCase().trim();

  // Check direct mappings first
  if (cityMappings[normalizedCity]) {
    return cityMappings[normalizedCity];
  }

  // If no mapping found, return the original city name
  // (assuming it might already be in English)
  return cityName;
};

/**
 * Get English designation name from designation code or title
 * @param {string} designation - The designation title or code
 * @returns {string} English designation name
 */
const getEnglishDesignationName = (designation) => {
  if (!designation) return null;

  // Common designation mappings
  const designationMappings = {
    // Engineer variations
    engineer: "Engineer",
    अभियंता: "Engineer",
    ಎಂಜಿನಿಯರ್: "Engineer",

    // Mayor variations
    mayor: "Mayor",
    मेयर: "Mayor",
    ಮೇಯರ್: "Mayor",

    // Councillor variations
    councillor: "Councillor",
    पार्षद: "Councillor",
    ಪಾರ್ಷದ: "Councillor",

    // First Division Assistant variations
    first_division_assistant: "First Division Assistant",
    "प्रथम श्रेणी सहायक": "First Division Assistant",
    "ಫಸ್ಟ್ ಡಿವಿಷನ್ ಅಸಿಸ್ಟಂಟ್": "First Division Assistant",

    // Add more mappings as needed
  };

  const normalizedDesignation = designation.toLowerCase().trim();

  // Check direct mappings first
  if (designationMappings[normalizedDesignation]) {
    return designationMappings[normalizedDesignation];
  }

  // If no mapping found, return the original designation
  // (assuming it might already be in English)
  return designation;
};

/**
 * Get English designation and name from database using phone number, ward, city, and department
 * @param {string} phoneNumber - The phone number
 * @param {number} wardNo - The ward number
 * @param {string} city - The city name
 * @param {string} departmentCode - The department code (e.g., "day_nulm_section")
 * @returns {Object} Object containing English designation and name
 */
const getEnglishDesignationAndNameFromDB = async (
  phoneNumber,
  wardNo,
  city,
  departmentCode
) => {
  try {
    // First, get the city_id and ward_id from the city name and ward number
    const cityRecord = await prisma.cities.findFirst({
      where: {
        name: city,
      },
    });

    if (!cityRecord) {
      console.log(`City not found: ${city}`);
      return { designation: null, name: null };
    }
    console.log(`City found: ${city} -> city_id: ${cityRecord.id}`);

    const wardRecord = await prisma.wards.findFirst({
      where: {
        city_id: cityRecord.id,
        ward_no: parseInt(wardNo),
      },
    });

    if (!wardRecord) {
      console.log(`Ward not found: ${wardNo} in city ${city}`);
      return { designation: null, name: null };
    }
    console.log(
      `Ward found: ${wardNo} in city ${city} -> ward_id: ${wardRecord.id}`
    );

    // Get department_id from department code
    const departmentRecord = await prisma.departments.findFirst({
      where: {
        code: departmentCode,
      },
    });

    if (!departmentRecord) {
      console.log(`Department not found: ${departmentCode}`);
      return { designation: null, name: null };
    }
    console.log(
      `Department found: ${departmentCode} -> department_id: ${departmentRecord.id}`
    );

    // Query the database to find the official with matching phone number, ward, city, and department
    // Try exact match first
    let official = await prisma.official.findFirst({
      where: {
        phone_number: phoneNumber,
        ward_id: wardRecord.id,
        city_id: cityRecord.id,
        department_id: departmentRecord.id,
        is_active: true,
      },
      include: {
        designation: {
          include: {
            translations: true, // Get all translations, not just English
          },
        },
      },
    });

    // If not found, try without department constraint (in case department mapping is wrong)
    if (!official) {
      console.log(
        `Exact match not found, trying without department constraint...`
      );
      official = await prisma.official.findFirst({
        where: {
          phone_number: phoneNumber,
          ward_id: wardRecord.id,
          city_id: cityRecord.id,
          is_active: true,
        },
        include: {
          designation: {
            include: {
              translations: true, // Get all translations
            },
          },
        },
      });
    }

    // If still not found, try just phone number and ward
    if (!official) {
      console.log(`Department match not found, trying just phone and ward...`);
      official = await prisma.official.findFirst({
        where: {
          phone_number: phoneNumber,
          ward_id: wardRecord.id,
          is_active: true,
        },
        include: {
          designation: {
            include: {
              translations: true, // Get all translations
            },
          },
        },
      });
    }

    if (
      official &&
      official.designation &&
      official.designation.translations.length > 0
    ) {
      // Try to find English translation first, fallback to mapping, then other languages
      let englishTitle = null;
      const englishTranslation = official.designation.translations.find(
        (t) => t.language === "en"
      );
      if (englishTranslation) {
        englishTitle = englishTranslation.title;
      } else {
        // Try to map the designation to English using our mapping
        const mappedTitle = getEnglishDesignationName(
          official.designation.translations[0].title
        );
        if (mappedTitle) {
          englishTitle = mappedTitle;
        } else {
          // Final fallback to first available translation (usually Hindi or Kannada)
          englishTitle = official.designation.translations[0].title;
        }
      }

      return {
        designation: englishTitle, // English designation from database (or fallback)
        name: official.name, // English name from database
        departmentCode: departmentCode, // Return the department code we used for lookup
      };
    }

    // If not found, return null values
    console.log(
      `Official not found for phone: ${phoneNumber}, ward: ${wardNo}, city: ${city}, dept: ${departmentCode}`
    );
    return {
      designation: null,
      name: null,
    };
  } catch (error) {
    console.error(
      "Error fetching English designation and name from DB:",
      error
    );
    return {
      designation: null,
      name: null,
    };
  }
};

module.exports = {
  getEnglishNamesFromComplaintCode,
  getEnglishCityName,
  getEnglishDesignationName,
  getEnglishDesignationAndNameFromDB,
};
