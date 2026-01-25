const prisma = require("../utils/prisma");
const { validateLanguage, normalizeLanguage } = require("../utils/language");


const sanitizeString = (str) => {
  if (typeof str !== "string") return "";
 
  return str
    .trim()
    .replace(/[<>]/g, "") 
    .substring(0, 1000); 
};


const checkDuplicateSubmission = async (
  mobile,
  wardNumber,
  officerId,
  city
) => {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const duplicate = await prisma.citizen_feedback.findFirst({
    where: {
      mobile: mobile,
      ward_number: wardNumber,
      officer_id: officerId,
      city: city,
      created_at: {
        gte: oneDayAgo,
      },
    },
  });

  return duplicate !== null;
};


const submitFeedback = async (req, res) => {
  try {
    const {
      name,
      mobile,
      address,
      city,
      state,
      ward_number,
      complaint_type, // 1 or 2
      date_spoken, // only for type 2
      officer_id,
      officer_name,
      officer_designation,
      officer_phone,
      issue_type,
      photo_urls, // Array of URLs
      issue_location,
      comments,
      language = "en",
    } = req.body;

    // Validate required fields
    if (
      !name ||
      !mobile ||
      !address ||
      !city ||
      !state ||
      !ward_number ||
      !complaint_type ||
      !officer_designation ||
      !officer_phone ||
      !issue_location
    ) {
      return res.status(400).json({
        error:
          "Missing required fields: name, mobile, address, city, state, ward_number, complaint_type, officer_designation, officer_phone, issue_location",
      });
    }

    // Validate and sanitize name
    const cleanName = sanitizeString(name);
    if (cleanName.length < 2 || cleanName.length > 100) {
      return res.status(400).json({
        error: "Name must be between 2 and 100 characters",
      });
    }

    // Validate mobile number (10 digits only)
    const cleanMobile = mobile.trim().replace(/\D/g, "");
    if (cleanMobile.length !== 10) {
      return res.status(400).json({
        error: "Mobile number must be exactly 10 digits",
      });
    }

    // Validate and sanitize address
    const cleanAddress = sanitizeString(address);
    if (cleanAddress.length < 10 || cleanAddress.length > 500) {
      return res.status(400).json({
        error: "Address must be between 10 and 500 characters",
      });
    }

    // Validate and sanitize city
    const cleanCity = sanitizeString(city);
    if (cleanCity.length < 2 || cleanCity.length > 100) {
      return res.status(400).json({
        error: "City must be between 2 and 100 characters",
      });
    }

    // Validate and sanitize state
    const cleanState = sanitizeString(state);
    if (cleanState.length < 2 || cleanState.length > 100) {
      return res.status(400).json({
        error: "State must be between 2 and 100 characters",
      });
    }

    // Validate ward_number (must be positive integer)
    const wardNum = parseInt(ward_number);
    if (isNaN(wardNum) || wardNum < 1 || wardNum > 1000) {
      return res.status(400).json({
        error: "Ward number must be a valid number between 1 and 1000",
      });
    }

    // Validate complaint_type
    const complaintTypeNum = parseInt(complaint_type);
    if (![1, 2].includes(complaintTypeNum)) {
      return res.status(400).json({
        error: "complaint_type must be either 1 or 2",
      });
    }

    // Validate date_spoken for type 2
    if (complaintTypeNum === 2 && !date_spoken) {
      return res.status(400).json({
        error: "date_spoken is required when complaint_type is 2",
      });
    }

    // Validate date_spoken is not in future
    if (date_spoken) {
      const spokenDate = new Date(date_spoken);
      if (spokenDate > new Date()) {
        return res.status(400).json({
          error: "date_spoken cannot be in the future",
        });
      }
    }

    const cleanOfficerName = officer_name ? sanitizeString(officer_name) : null;
    const cleanOfficerDesignation = sanitizeString(officer_designation);
    const cleanOfficerPhone = sanitizeString(officer_phone);

    // Validate officer_name if provided
    if (cleanOfficerName && cleanOfficerName.length > 200) {
      return res.status(400).json({
        error: "Officer name must be less than 200 characters",
      });
    }

    if (cleanOfficerDesignation.length === 0) {
      return res.status(400).json({
        error: "Officer designation is required",
      });
    }

    // Validate and sanitize issue_location
    const cleanIssueLocation = sanitizeString(issue_location);
    if (cleanIssueLocation.length < 5 || cleanIssueLocation.length > 500) {
      return res.status(400).json({
        error: "Issue location must be between 5 and 500 characters",
      });
    }

    // Validate and sanitize comments
    let cleanComments = null;
    if (comments) {
      cleanComments = sanitizeString(comments);
      if (cleanComments.length > 1000) {
        return res.status(400).json({
          error: "Comments must be less than 1000 characters",
        });
      }
    }

    // Validate photo_urls array
    if (!Array.isArray(photo_urls) || photo_urls.length === 0) {
      return res.status(400).json({
        error: "At least one photo is required",
      });
    }

    if (photo_urls.length > 10) {
      return res.status(400).json({
        error: "Maximum 10 photos allowed",
      });
    }

    // Validate each photo URL
    const urlPattern = /^https?:\/\/.+/i;
    for (const url of photo_urls) {
      if (!urlPattern.test(url)) {
        return res.status(400).json({
          error: "Invalid photo URL format",
        });
      }
    }

    // Validate language parameter
    const languageValidation = validateLanguage(language);
    if (!languageValidation.valid) {
      return res.status(400).json({ error: languageValidation.error });
    }

    const effectiveLanguage = normalizeLanguage(language);

    // Get client IP address
    const clientIP =
      req.ip ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.connection?.socket?.remoteAddress ||
      "unknown";

    // Try to find the ward_id from the database (Prisma prevents SQL injection)
    let wardId = null;
    let wardResolutionWarning = null;

    try {
      const cityRecord = await prisma.cities.findFirst({
        where: {
          name: {
            equals: cleanCity,
            mode: "insensitive",
          },
        },
      });

      if (!cityRecord) {
        console.warn(`City not found in database: ${cleanCity}`);
        wardResolutionWarning = `City '${cleanCity}' not found in database. Feedback will be stored but not linked to city record.`;
      } else {
        const wardRecord = await prisma.wards.findFirst({
          where: {
            city_id: cityRecord.id,
            ward_no: wardNum,
          },
        });

        if (!wardRecord) {
          console.warn(
            `Ward ${wardNum} not found for city ${cleanCity} (city_id: ${cityRecord.id})`
          );
          wardResolutionWarning = `Ward ${wardNum} not found for ${cleanCity}. Feedback will be stored but not linked to ward record.`;
        } else {
          wardId = wardRecord.id;
          console.log(
            `Successfully resolved ward: ${cleanCity} Ward ${wardNum} (ward_id: ${wardId})`
          );
        }
      }
    } catch (error) {
      console.error("Error finding ward:", error);
      wardResolutionWarning =
        "Error resolving ward information. Feedback will be stored with city and ward number only.";
      // Continue without ward_id - feedback will still be saved
    }

    // Validate and sanitize officer_id
    let cleanOfficerId = null;
    if (officer_id) {
      cleanOfficerId = sanitizeString(officer_id).substring(0, 50);

      // Validate officer_id format (should be alphanumeric with optional dashes/underscores)
      if (cleanOfficerId && !/^[a-zA-Z0-9_-]+$/.test(cleanOfficerId)) {
        return res.status(400).json({
          error:
            "Invalid officer ID format. Officer ID must contain only letters, numbers, dashes, and underscores.",
        });
      }

      if (cleanOfficerId.length === 0) {
        cleanOfficerId = null;
      }
    }

    // Sanitize optional issue_type
    const cleanIssueType = issue_type
      ? sanitizeString(issue_type).substring(0, 100)
      : null;

    // Check for duplicate submission
    const isDuplicate = await checkDuplicateSubmission(
      cleanMobile,
      wardNum,
      cleanOfficerId,
      cleanCity
    );

    if (isDuplicate) {
      return res.status(409).json({
        error:
          "Duplicate submission detected. You have already submitted feedback for this officer in the last 24 hours. Please wait before submitting again or contact support if this is urgent.",
        code: "DUPLICATE_SUBMISSION",
      });
    }

   
    const feedback = await prisma.citizen_feedback.create({
      data: {
        name: cleanName,
        mobile: cleanMobile,
        address: cleanAddress,
        city: cleanCity,
        state: cleanState,
        ward_number: wardNum,
        ward_id: wardId,
        complaint_type: complaintTypeNum,
        date_spoken:
          complaintTypeNum === 2 && date_spoken ? new Date(date_spoken) : null,
        officer_id: cleanOfficerId,
        officer_name: cleanOfficerName,
        officer_designation: cleanOfficerDesignation,
        officer_phone: cleanOfficerPhone,
        issue_type: cleanIssueType,
        photo_urls: photo_urls,
        issue_location: cleanIssueLocation,
        comments: cleanComments,
        language: effectiveLanguage,
        ip: clientIP,
      },
    });

    res.status(201).json({
      success: true,
      message: "Feedback submitted successfully. Thank you for your feedback!",
      data: {
        id: feedback.id,
        created_at: feedback.created_at,
        ward_linked: wardId !== null,
      },
      ...(wardResolutionWarning && { warning: wardResolutionWarning }),
    });
  } catch (error) {
    console.error("Error submitting feedback:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Get feedback by ID (for tracking)
 */
const getFeedback = async (req, res) => {
  try {
    const { id } = req.params;

    const feedback = await prisma.citizen_feedback.findUnique({
      where: {
        id: parseInt(id),
      },
      include: {
        ward: {
          include: {
            city: true,
          },
        },
      },
    });

    if (!feedback) {
      return res.status(404).json({ error: "Feedback not found" });
    }

    res.json({
      success: true,
      data: feedback,
    });
  } catch (error) {
    console.error("Error fetching feedback:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Get all feedbacks (admin endpoint - add authentication later)
 */
const getAllFeedbacks = async (req, res) => {
  try {
    const {
      city,
      ward_number,
      complaint_type,
      limit = 100,
      offset = 0,
    } = req.query;

    const whereClause = {};

    if (city) {
      whereClause.city = { equals: city, mode: "insensitive" };
    }
    if (ward_number) {
      whereClause.ward_number = parseInt(ward_number);
    }
    if (complaint_type) {
      whereClause.complaint_type = parseInt(complaint_type);
    }

    const [feedbacks, totalCount] = await Promise.all([
      prisma.citizen_feedback.findMany({
        where: whereClause,
        orderBy: { created_at: "desc" },
        take: parseInt(limit),
        skip: parseInt(offset),
        include: {
          ward: {
            include: {
              city: true,
            },
          },
        },
      }),
      prisma.citizen_feedback.count({
        where: whereClause,
      }),
    ]);

    res.json({
      success: true,
      data: feedbacks,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: totalCount > parseInt(offset) + parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching feedbacks:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Update feedback status
 */
const updateFeedbackStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    // Validate status
    const validStatuses = ["pending", "resolved", "not_seen"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const feedback = await prisma.citizen_feedback.update({
      where: {
        id: parseInt(id),
      },
      data: {
        status: status,
      },
    });

    res.json({
      success: true,
      message: "Status updated successfully",
      data: feedback,
    });
  } catch (error) {
    console.error("Error updating feedback status:", error);
    if (error.code === 'P2025') {
       return res.status(404).json({ error: "Feedback not found" });
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  submitFeedback,
  getFeedback,
  getAllFeedbacks,
  updateFeedbackStatus,
};

