const ExcelJS = require("exceljs");
const prisma = require("../utils/prisma");
const {
  getEnglishNamesFromComplaintCode,
  getEnglishCityName,
  getEnglishDesignationName,
} = require("../utils/complaintLookup");

let structuredComplaints = {};
try {
  structuredComplaints = require("../structured_complaints.json");
} catch (error) {
  console.warn("structured_complaints.json could not be loaded");
}

const REPORT_AUTH_PASSWORD =
  process.env.ANALYTICS_REPORT_PASSWORD || "civinc-report@2026";

const toTitleFromCode = (value) => {
  if (!value) return "";
  return String(value)
    .trim()
    .replace(/_/g, " ")
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

const formatDepartmentName = (departmentCode) => {
  if (!departmentCode) return "";

  const code = String(departmentCode).trim().toLowerCase();
  const overrides = {
    health_section: "Health Department",
    technical_section: "Technical section",
    water_supply_valve: "Water supply valve",
    water_supply_leak: "Water supply leak",
    day_nulm_section: "National Urban Livelihood Mission",
  };

  if (overrides[code]) return overrides[code];
  return toTitleFromCode(code);
};

const formatDesignationFallback = (designationCode) => {
  if (!designationCode) return "Unknown";
  if (String(designationCode).toLowerCase().includes("hod")) return "Hod";
  return toTitleFromCode(designationCode);
};

const isHodCode = (designationCode) => {
  if (!designationCode) return false;
  return /(^|_)hod($|_)|head_of/i.test(designationCode);
};

const designationPriority = (designationCode) => {
  if (!designationCode) return 999;
  const code = String(designationCode).toLowerCase();
  const priorityMap = {
    assistant_engineer: 10,
    junior_engineer: 20,
    first_division_assistant: 30,
    sanitary_supervisor: 40,
    senior_health_inspector: 50,
    junior_health_inspector: 60,
  };
  return priorityMap[code] ?? 500;
};

const getActionMetric = (actionType) => {
  const value = String(actionType || "").toLowerCase();
  if (value === "copied") return "copied";
  if (value === "tapped" || value === "clicked") return "clicked";
  return null;
};

const getDateRangeWhereClause = (startDate, endDate) => {
  if (!startDate && !endDate) return null;

  const createdAt = {};
  if (startDate) {
    const startDateTime = new Date(startDate);
    if (isNaN(startDateTime.getTime())) return { error: "Invalid start_date" };
    startDateTime.setHours(0, 0, 0, 0);
    createdAt.gte = startDateTime;
  }

  if (endDate) {
    const endDateTime = new Date(endDate);
    if (isNaN(endDateTime.getTime())) return { error: "Invalid end_date" };
    endDateTime.setHours(23, 59, 59, 999);
    createdAt.lte = endDateTime;
  }

  if (createdAt.gte && createdAt.lte && createdAt.gte > createdAt.lte) {
    return { error: "start_date must be before or equal to end_date" };
  }

  return { value: createdAt };
};

const createReportToken = () => {
  return Buffer.from(
    JSON.stringify({
      role: "analytics_report",
      timestamp: Date.now(),
    })
  ).toString("base64");
};

const decodeReportToken = (token) => {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    if (decoded?.role !== "analytics_report") return null;
    return decoded;
  } catch {
    return null;
  }
};

const verifyReportRequest = (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "No token provided" });
    return null;
  }

  const token = authHeader.split(" ")[1];
  const decoded = decodeReportToken(token);
  if (!decoded) {
    res.status(401).json({ success: false, message: "Invalid token" });
    return null;
  }

  return decoded;
};

const buildStructuredComplaintLookup = () => {
  const lookup = new Map();

  for (const [departmentCode, departmentData] of Object.entries(
    structuredComplaints || {}
  )) {
    const categories = departmentData?.en?.complaint_categories || [];
    for (const category of categories) {
      for (const complaint of category.complaints || []) {
        lookup.set(complaint.code, {
          complaintTitle: complaint.title || toTitleFromCode(complaint.code),
          departmentCode,
          departmentName: formatDepartmentName(departmentCode),
        });
      }
    }
  }

  return lookup;
};

const getTemplateHeaders = (maxOfficerCount) => {
  const headers = ["complaint Type", "Department"];
  for (let i = 1; i <= maxOfficerCount; i++) {
    const nameLabel = i === 3 ? "Hod" : "Name";
    const callsLabel =
      i === 1 ? "Number of Calls Placed" : `Number of Calls Placed ${i}`;
    const copiedLabel = i === 1 ? "Number Copied" : `Number Copied ${i}`;
    headers.push(nameLabel, callsLabel, copiedLabel);
  }
  return headers;
};

const setReportColumnWidths = (worksheet, totalColumns) => {
  const repeating = [25, 20, 15];
  for (let i = 1; i <= totalColumns; i++) {
    if (i === 1) worksheet.getColumn(i).width = 40;
    else if (i === 2) worksheet.getColumn(i).width = 25;
    else worksheet.getColumn(i).width = repeating[(i - 3) % repeating.length];
  }
};

const applyHeaderStyle = (row, totalColumns) => {
  row.height = 15;
  for (let col = 1; col <= totalColumns; col++) {
    const cell = row.getCell(col);
    cell.font = { bold: true, name: "Cambria", size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
  }
};

const safeSheetName = (baseName, workbook) => {
  let name = baseName.slice(0, 31);
  if (!workbook.getWorksheet(name)) return name;

  let counter = 2;
  while (counter < 1000) {
    const suffix = `_${counter}`;
    const trimmed = baseName.slice(0, 31 - suffix.length);
    name = `${trimmed}${suffix}`;
    if (!workbook.getWorksheet(name)) return name;
    counter += 1;
  }
  return `Sheet_${Date.now()}`.slice(0, 31);
};

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

    if (!["copied", "tapped", "clicked"].includes(action_type)) {
      return res.status(400).json({
        error: "action_type must be either 'copied', 'tapped', or 'clicked'",
      });
    }

    const clientIP =
      req.ip ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
      "unknown";

    const englishCity = getEnglishCityName(city);
    const englishDesignation = getEnglishDesignationName(designation);
    const englishData = getEnglishNamesFromComplaintCode(complaint_code);
    const englishComplaint = englishData.complaint;
    const englishDepartmentCode =
      englishData.departmentCode || String(department).trim();

    const normalizedActionType =
      String(action_type).toLowerCase() === "clicked" ? "tapped" : action_type;

    const analyticsRecord = await prisma.phone_interaction_analytics.create({
      data: {
        ip: clientIP,
        ward_no: parseInt(ward_no),
        city: englishCity,
        designation: englishDesignation,
        complaint: englishComplaint || complaint || null,
        complaint_code: complaint_code ? complaint_code.trim() : null,
        department: englishDepartmentCode,
        action_type: normalizedActionType,
        phone_number: String(phone_number).trim(),
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

    const whereClause = {};
    if (ward_no) whereClause.ward_no = parseInt(ward_no);
    if (city) whereClause.city = { equals: city, mode: "insensitive" };
    if (department)
      whereClause.department = { equals: department, mode: "insensitive" };
    if (designation)
      whereClause.designation = { equals: designation, mode: "insensitive" };
    if (action_type) whereClause.action_type = action_type;

    const rangeClause = getDateRangeWhereClause(start_date, end_date);
    if (rangeClause?.error) {
      return res.status(400).json({ error: rangeClause.error });
    }
    if (rangeClause?.value) whereClause.created_at = rangeClause.value;

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

const analyticsReportLogin = async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) {
      return res
        .status(400)
        .json({ success: false, message: "Password is required" });
    }

    if (password !== REPORT_AUTH_PASSWORD) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid password" });
    }

    const token = createReportToken();
    return res.status(200).json({
      success: true,
      message: "Authentication successful",
      data: { token },
    });
  } catch (error) {
    console.error("Analytics report login error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const verifyAnalyticsReportToken = async (req, res) => {
  try {
    const decoded = verifyReportRequest(req, res);
    if (!decoded) return;

    return res.status(200).json({
      success: true,
      message: "Token is valid",
      data: { role: decoded.role },
    });
  } catch (error) {
    console.error("Analytics report token verification error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

const exportPhoneAnalyticsToExcel = async (req, res) => {
  try {
    const decoded = verifyReportRequest(req, res);
    if (!decoded) return;

    const {
      ward_no,
      city,
      department,
      designation,
      complaint_code,
      start_date,
      end_date,
    } = req.query;

    const whereClause = {};
    if (ward_no) whereClause.ward_no = parseInt(ward_no);
    if (city) whereClause.city = { equals: city, mode: "insensitive" };
    if (department)
      whereClause.department = { equals: department, mode: "insensitive" };
    if (designation)
      whereClause.designation = { equals: designation, mode: "insensitive" };
    if (complaint_code)
      whereClause.complaint_code = {
        equals: complaint_code,
        mode: "insensitive",
      };

    const rangeClause = getDateRangeWhereClause(start_date, end_date);
    if (rangeClause?.error) {
      return res.status(400).json({ error: rangeClause.error });
    }
    if (rangeClause?.value) whereClause.created_at = rangeClause.value;

    const analyticsRows = await prisma.phone_interaction_analytics.findMany({
      where: whereClause,
      orderBy: { created_at: "desc" },
    });

    if (!analyticsRows.length) {
      return res.status(404).json({
        error: "No analytics records found for the specified filters",
      });
    }

    const structuredComplaintLookup = buildStructuredComplaintLookup();
    const cityNames = [
      ...new Set(analyticsRows.map((row) => row.city).filter(Boolean)),
    ];
    const complaintCodes = [
      ...new Set(analyticsRows.map((row) => row.complaint_code).filter(Boolean)),
    ];

    const cityRecords = await Promise.all(
      cityNames.map((name) =>
        prisma.cities.findFirst({
          where: {
            name: {
              equals: name,
              mode: "insensitive",
            },
          },
          select: { id: true, name: true },
        })
      )
    );

    const cityIdByName = new Map();
    for (const record of cityRecords) {
      if (!record) continue;
      cityIdByName.set(record.name.toLowerCase(), record.id);
    }

    const wardNos = [
      ...new Set(
        analyticsRows
          .map((row) => Number.parseInt(row.ward_no, 10))
          .filter(Number.isFinite)
      ),
    ];
    const cityIds = [...new Set(cityRecords.filter(Boolean).map((c) => c.id))];

    const wards = cityIds.length
      ? await prisma.wards.findMany({
          where: {
            city_id: { in: cityIds },
            ward_no: { in: wardNos },
          },
          select: { id: true, city_id: true, ward_no: true },
        })
      : [];

    const wardIdByCityWardNo = new Map();
    for (const ward of wards) {
      wardIdByCityWardNo.set(`${ward.city_id}|${ward.ward_no}`, ward.id);
    }

    const complaintRows = complaintCodes.length
      ? await prisma.complaints.findMany({
          where: { code: { in: complaintCodes } },
          include: {
            translations: {
              where: { language: "en" },
              select: { title: true },
            },
            complaint_category: {
              include: {
                department: {
                  include: {
                    translations: {
                      where: { language: "en" },
                      select: { name: true },
                    },
                  },
                },
              },
            },
          },
        })
      : [];

    const complaintLookup = new Map();
    for (const row of complaintRows) {
      complaintLookup.set(row.code, {
        complaintTitle:
          row.translations?.[0]?.title || toTitleFromCode(row.code),
        departmentCode: row.complaint_category?.department?.code || null,
        departmentName:
          row.complaint_category?.department?.translations?.[0]?.name || null,
      });
    }

    for (const code of complaintCodes) {
      if (!complaintLookup.has(code)) {
        const structured = structuredComplaintLookup.get(code);
        complaintLookup.set(code, {
          complaintTitle: structured?.complaintTitle || toTitleFromCode(code),
          departmentCode: structured?.departmentCode || null,
          departmentName: structured?.departmentName || null,
        });
      }
    }

    const wardIds = [
      ...new Set(
        analyticsRows
          .map((row) => {
            const cityId = cityIdByName.get(String(row.city || "").toLowerCase());
            if (!cityId) return null;
            return wardIdByCityWardNo.get(`${cityId}|${row.ward_no}`) || null;
          })
          .filter(Boolean)
      ),
    ];

    const officials = wardIds.length
      ? await prisma.official.findMany({
          where: {
            ward_id: { in: wardIds },
            is_active: true,
          },
          include: {
            ward: { select: { city_id: true, ward_no: true } },
            department: { select: { code: true } },
            translations: {
              where: { language: "en" },
              select: { name: true },
            },
          },
        })
      : [];

    const officialByExact = new Map();
    const officialByWardDesignation = new Map();
    const officialByCityDesignation = new Map();
    for (const official of officials) {
      const name = official.translations?.[0]?.name || official.name;
      const cityId = official.ward.city_id;
      const wardNo = official.ward.ward_no;
      const departmentCode = official.department.code;
      const designationCode = official.designation_code;

      officialByExact.set(
        `${cityId}|${wardNo}|${departmentCode}|${designationCode}`,
        name
      );

      const wardDesignationKey = `${cityId}|${wardNo}|${designationCode}`;
      if (!officialByWardDesignation.has(wardDesignationKey)) {
        officialByWardDesignation.set(wardDesignationKey, name);
      }

      const cityDesignationKey = `${cityId}|${designationCode}`;
      if (!officialByCityDesignation.has(cityDesignationKey)) {
        officialByCityDesignation.set(cityDesignationKey, name);
      }
    }

    const groupedWards = new Map();
    for (const row of analyticsRows) {
      const metric = getActionMetric(row.action_type);
      if (!metric) continue;

      const wardNo = Number.parseInt(row.ward_no, 10);
      if (!Number.isFinite(wardNo)) continue;

      const cityName = String(row.city || "").trim();
      const cityId = cityIdByName.get(cityName.toLowerCase()) || null;
      const rowDepartmentCode = String(row.department || "unknown")
        .trim()
        .toLowerCase();
      const rowComplaintCode =
        String(row.complaint_code || "").trim().toLowerCase() ||
        "__unspecified__";
      const rowDesignationCode =
        String(row.designation || "").trim().toLowerCase() || "unknown";

      const complaintMeta =
        complaintLookup.get(rowComplaintCode) ||
        structuredComplaintLookup.get(rowComplaintCode) || {
          complaintTitle:
            rowComplaintCode === "__unspecified__"
              ? "Unspecified Complaint"
              : toTitleFromCode(rowComplaintCode),
          departmentCode: null,
          departmentName: null,
        };

      const departmentCode =
        rowDepartmentCode || complaintMeta.departmentCode || "unknown";
      const rowKey = `${departmentCode}|${rowComplaintCode}`;
      const wardKey = `${cityName}|${wardNo}`;

      if (!groupedWards.has(wardKey)) {
        groupedWards.set(wardKey, {
          city: cityName,
          wardNo,
          cityId,
          rows: new Map(),
        });
      }

      const wardBucket = groupedWards.get(wardKey);
      if (!wardBucket.rows.has(rowKey)) {
        wardBucket.rows.set(rowKey, {
          complaintTitle:
            complaintMeta.complaintTitle ||
            (rowComplaintCode === "__unspecified__"
              ? "Unspecified Complaint"
              : toTitleFromCode(rowComplaintCode)),
          departmentCode,
          departmentName:
            complaintMeta.departmentName || formatDepartmentName(departmentCode),
          officers: new Map(),
        });
      }

      const rowBucket = wardBucket.rows.get(rowKey);
      if (!rowBucket.officers.has(rowDesignationCode)) {
        rowBucket.officers.set(rowDesignationCode, {
          designationCode: rowDesignationCode,
          clicked: 0,
          copied: 0,
        });
      }

      const officerBucket = rowBucket.officers.get(rowDesignationCode);
      if (metric === "clicked") officerBucket.clicked += 1;
      if (metric === "copied") officerBucket.copied += 1;
    }

    const workbook = new ExcelJS.Workbook();
    const sortedWardBuckets = [...groupedWards.values()].sort(
      (a, b) => a.wardNo - b.wardNo
    );

    for (const ward of sortedWardBuckets) {
      const rowObjects = [];
      for (const row of ward.rows.values()) {
        const officers = [...row.officers.values()].map((officer) => {
          const exactKey = `${ward.cityId}|${ward.wardNo}|${row.departmentCode}|${officer.designationCode}`;
          const wardDesignationKey = `${ward.cityId}|${ward.wardNo}|${officer.designationCode}`;
          const cityDesignationKey = `${ward.cityId}|${officer.designationCode}`;

          const name =
            officialByExact.get(exactKey) ||
            officialByWardDesignation.get(wardDesignationKey) ||
            officialByCityDesignation.get(cityDesignationKey) ||
            formatDesignationFallback(officer.designationCode);

          const total = officer.clicked + officer.copied;
          return { ...officer, total, name };
        });

        officers.sort((a, b) => {
          const aHod = isHodCode(a.designationCode);
          const bHod = isHodCode(b.designationCode);
          if (aHod !== bHod) return aHod ? 1 : -1;
          if (b.total !== a.total) return b.total - a.total;
          const aPriority = designationPriority(a.designationCode);
          const bPriority = designationPriority(b.designationCode);
          if (aPriority !== bPriority) return aPriority - bPriority;
          return String(a.name).localeCompare(String(b.name));
        });

        rowObjects.push({
          complaintTitle: row.complaintTitle,
          departmentName: row.departmentName,
          officers,
        });
      }

      rowObjects.sort((a, b) =>
        String(a.complaintTitle).localeCompare(String(b.complaintTitle))
      );

      const maxOfficerCount = Math.max(
        1,
        ...rowObjects.map((row) => row.officers.length)
      );
      const sheetName = safeSheetName(`Ward_${ward.wardNo}`, workbook);
      const worksheet = workbook.addWorksheet(sheetName);

      const headers = getTemplateHeaders(maxOfficerCount);
      setReportColumnWidths(worksheet, headers.length);
      const headerRow = worksheet.addRow(headers);
      applyHeaderStyle(headerRow, headers.length);

      for (const row of rowObjects) {
        const values = [row.complaintTitle, row.departmentName];
        for (let i = 0; i < maxOfficerCount; i++) {
          const officer = row.officers[i];
          values.push(
            officer?.name || "",
            officer?.clicked || 0,
            officer?.copied || 0
          );
        }
        worksheet.addRow(values);
      }
    }

    const timestamp = new Date().toISOString().split("T")[0];
    let filename = `phone-analytics-report-${timestamp}`;
    if (city) filename += `-${city}`;
    if (ward_no) filename += `-ward${ward_no}`;
    if (start_date) filename += `-from${start_date}`;
    if (end_date) filename += `-to${end_date}`;
    filename += ".xlsx";

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting phone analytics to Excel:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  trackPhoneInteraction,
  getPhoneAnalytics,
  analyticsReportLogin,
  verifyAnalyticsReportToken,
  exportPhoneAnalyticsToExcel,
};
