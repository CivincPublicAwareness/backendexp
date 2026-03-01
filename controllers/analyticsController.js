const prisma = require("../utils/prisma");
const {
  getEnglishNamesFromComplaintCode,
  getEnglishCityName,
  getEnglishDesignationName,
} = require("../utils/complaintLookup");

const trackPhoneInteraction = async (req, res) => {
  try {
    const {
      ward_no,
      city,
      designation,
      complaint, // Legacy field - keeping for backward compatibility
      complaint_code, // New standardized field
      department,
      action_type, // "copied" or "tapped"
      phone_number,
    } = req.body;

    // Validate required fields
    if (
      !ward_no ||
      !city ||
      !designation ||
      !department ||
      !action_type ||
      !phone_number
    ) {
      return res.status(400).json({
        error:
          "ward_no, city, designation, department, action_type, and phone_number are required",
      });
    }

    // Validate action_type
    if (!["copied", "tapped"].includes(action_type)) {
      return res.status(400).json({
        error: "action_type must be either 'copied' or 'tapped'",
      });
    }

    // Get client IP address
    const clientIP =
      req.ip ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
      "unknown";

    // Standardize all fields to English
    const englishCity = getEnglishCityName(city);
    const englishDesignation = getEnglishDesignationName(designation);

    // Get English names from complaint code
    const englishData = getEnglishNamesFromComplaintCode(complaint_code);
    const englishComplaint = englishData.complaint;
    const englishDepartmentCode =
      englishData.departmentCode || department.trim();

    // Create analytics record with English standardized data
    const analyticsRecord = await prisma.phone_interaction_analytics.create({
      data: {
        ip: clientIP,
        ward_no: parseInt(ward_no),
        city: englishCity,
        designation: englishDesignation,
        complaint: englishComplaint, // Now stores English complaint name
        complaint_code: complaint_code ? complaint_code.trim() : null,
        department: englishDepartmentCode,
        action_type: action_type,
        phone_number: phone_number.trim(),
      },
    });

    res.status(201).json({
      success: true,
      message: "Phone interaction tracked successfully",
      data: {
        id: analyticsRecord.id,
        action_type: analyticsRecord.action_type,
        phone_number: analyticsRecord.phone_number,
        complaint_code: analyticsRecord.complaint_code,
        timestamp: analyticsRecord.created_at,
      },
    });
  } catch (error) {
    console.error("Error tracking phone interaction:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getPhoneAnalytics = async (req, res) => {
  try {
    const {
      ward_no,
      city,
      department,
      designation,
      action_type,
      start_date,
      end_date,
      limit = 100,
      offset = 0,
    } = req.query;

    // Build where clause
    const whereClause = {};

    if (ward_no) whereClause.ward_no = parseInt(ward_no);
    if (city) whereClause.city = { equals: city, mode: "insensitive" };
    if (department)
      whereClause.department = { equals: department, mode: "insensitive" };
    if (designation)
      whereClause.designation = { equals: designation, mode: "insensitive" };
    if (action_type) whereClause.action_type = action_type;

    if (start_date || end_date) {
      whereClause.created_at = {};
      if (start_date) whereClause.created_at.gte = new Date(start_date);
      if (end_date) whereClause.created_at.lte = new Date(end_date);
    }

    // Get analytics data
    const [analytics, totalCount] = await Promise.all([
      prisma.phone_interaction_analytics.findMany({
        where: whereClause,
        orderBy: { created_at: "desc" },
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      prisma.phone_interaction_analytics.count({
        where: whereClause,
      }),
    ]);

    // Get summary statistics
    const summary = await prisma.phone_interaction_analytics.groupBy({
      by: ["action_type"],
      where: whereClause,
      _count: {
        action_type: true,
      },
    });

    res.json({
      success: true,
      data: analytics,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: totalCount > parseInt(offset) + parseInt(limit),
      },
      summary: {
        total_interactions: totalCount,
        by_action_type: summary.reduce((acc, item) => {
          acc[item.action_type] = item._count.action_type;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    console.error("Error fetching phone analytics:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  trackPhoneInteraction,
  getPhoneAnalytics,
};
