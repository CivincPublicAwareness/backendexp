const { validateLanguage } = require("../utils/language");
const prisma = require("../utils/prisma");

const createIssue = async (req, res) => {
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
      // New simplified fields
      name_wrong = false,
      number_wrong = false,
      address_wrong = false,
      comments = "",
    } = req.body;

    // Validate language parameter
    const languageValidation = validateLanguage(language);
    if (!languageValidation.valid) {
      return res.status(404).json({ error: languageValidation.error });
    }

    const userLanguage =
      language && typeof language === "string"
        ? language.trim().toLowerCase()
        : "en";

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

    // For simplified reporting, we'll use comments or fallback to description/message
    const issueDescription =
      comments || description || message || "Issue reported";

    // Validate that at least one checkbox is selected for simplified reporting
    if (!name_wrong && !number_wrong && !address_wrong) {
      return res.status(400).json({
        error:
          "At least one issue type must be selected (name, number, or address)",
      });
    }

    // Validate comments length if provided
    if (comments && comments.length > 50) {
      return res
        .status(400)
        .json({ error: "Comments must be 50 characters or less" });
    }

    if (!city) {
      return res.status(400).json({ error: "City is required" });
    }

    if (!ward_no) {
      return res.status(400).json({ error: "Ward number is required" });
    }

    const cleanCity = city.trim();

    let cityRecord = await prisma.cities.findFirst({
      where: {
        name: {
          equals: cleanCity,
          mode: "insensitive",
        },
      },
    });

    if (!cityRecord) {
      const firstWord = cleanCity.split(" ")[0];
      cityRecord = await prisma.cities.findFirst({
        where: {
          name: {
            contains: firstWord,
            mode: "insensitive",
          },
        },
      });
    }

    if (!cityRecord) {
      const allCities = await prisma.cities.findMany({
        select: { name: true },
      });

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
        }
      }
    }

    const issueId = Math.random().toString(36).substring(2, 14).toUpperCase();

    const baseLanguageCity = cityRecord.name;
    const baseLanguageWardName = wardRecord.name || `Ward ${ward_no}`;
    const baseLanguageDepartment = departmentName || "Unknown Department";
    const baseLanguageDesignation = designationTitle || "Unknown Designation";

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
        // New simplified fields
        name_wrong: Boolean(name_wrong),
        number_wrong: Boolean(number_wrong),
        address_wrong: Boolean(address_wrong),
        comments: comments ? comments.substring(0, 50) : null,
      },
    });

    let responseCity = baseLanguageCity;
    let responseWardName = baseLanguageWardName;
    let responseDepartment = baseLanguageDepartment;
    let responseDesignation = baseLanguageDesignation;

    if (normalizedLanguage !== "en") {
      try {
        const cityTranslation = await prisma.city_translations.findFirst({
          where: {
            city_id: cityRecord.id,
            language: normalizedLanguage,
          },
        });

        if (cityTranslation) {
          responseCity = cityTranslation.name;
        }

        const wardTranslation = await prisma.ward_translations.findFirst({
          where: {
            ward_id: wardRecord.id,
            language: normalizedLanguage,
          },
        });

        if (wardTranslation) {
          responseWardName = wardTranslation.name;
        }

        if (department_id) {
          const deptTranslation =
            await prisma.department_translations.findFirst({
              where: {
                department_id: parseInt(department_id),
                language: normalizedLanguage,
              },
            });

          if (deptTranslation) {
            responseDepartment = deptTranslation.name;
          }
        }

        if (designationTitle) {
          const desigTranslation =
            await prisma.designation_translations.findFirst({
              where: {
                code: designationTitle,
                language: normalizedLanguage,
              },
            });

          if (desigTranslation) {
            responseDesignation = desigTranslation.title;
          }
        }
      } catch (translationError) {
        console.log("Translation lookup failed, using base language");
      }
    }

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
        // New simplified fields
        name_wrong: issue.name_wrong,
        number_wrong: issue.number_wrong,
        address_wrong: issue.address_wrong,
        comments: issue.comments,
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
};

const fetchWardIssue = async (req, res) => {
  try {
    const { issueId, language = "en" } = req.query;

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

    let cityName = issue.city;
    let wardName = issue.ward_name;
    let departmentName = issue.category;
    let designationName = issue.designation;

    if (language !== "en") {
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
          }
        }
      } catch (translationError) {
        console.log("Translation lookup failed, using base language");
      }
    }

    // Get ward number from the ward record
    const wardNumber = issue.ward?.ward_no || null;

    // Determine what was reported as wrong
    const reportedIssues = [];
    if (issue.name_wrong) reportedIssues.push("Name");
    if (issue.number_wrong) reportedIssues.push("Phone Number");
    if (issue.address_wrong) reportedIssues.push("Address");

    const response = {
      issueId: issue.issueId,
      id: issue.id,
      created_at: issue.created_at,
      resolved: issue.resolved,
      resolved_at: issue.resolved_at,
      priority: issue.priority,

      // Location information
      location: {
        city: cityName,
        ward_name: wardName,
        ward_number: wardNumber,
        city_base: issue.city,
        ward_name_base: issue.ward_name,
      },

      // Reported issues (what was wrong)
      reported_issues: reportedIssues,
      issue_details: {
        name_wrong: issue.name_wrong,
        number_wrong: issue.number_wrong,
        address_wrong: issue.address_wrong,
        comments: issue.comments,
      },

      // Department and designation info
      department: {
        name: departmentName,
        name_base: issue.category,
        id: issue.department_id,
      },
      designation: {
        name: designationName,
        name_base: issue.designation,
        code: issue.designation,
      },

      // Original message (if any)
      message: issue.message,

      // Base language values for reference
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
};

module.exports = {
  createIssue,
  fetchWardIssue,
};
