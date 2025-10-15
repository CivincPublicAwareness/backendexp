const express = require("express");
const wkx = require("wkx");

const {
  corsMiddleware,
  preflightHandler,
  corsHeaders,
} = require("./middleware/cors");

const { cleanupExpiredCache } = require("./utils/cache");
const prisma = require("./utils/prisma");

// Import routes
const wardRoutes = require("./routes/wardRoutes");
const cacheRoutes = require("./routes/cacheRoutes");
const issueRoutes = require("./routes/issueRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");

const app = express();
const PORT = 3000;

// Load configuration files
try {
  require("./structured_complaints.json");
  require("./department_mapping.json");
  require("./supported_languages.json");
} catch (error) {
  console.error("Error loading configuration files:", error);
}

// Middleware setup
app.use(corsMiddleware);
app.options("*", preflightHandler);
app.use(corsHeaders);
app.use(express.json());

// Routes
app.use("/api", wardRoutes);
app.use("/api/cache", cacheRoutes);
app.use("/api", issueRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/feedback", feedbackRoutes);

app.get("/", (req, res) => {
  res.json({ message: "Express backend running" });
});

// Cache cleanup
setInterval(async () => {
  await cleanupExpiredCache();
}, 10 * 60 * 1000);

app.get("/api/ward-boundaries", async (req, res) => {
  try {
    const { north, south, east, west, city } = req.query;

    if (!north || !south || !east || !west || !city) {
      return res
        .status(400)
        .json({ error: "north, south, east, west, and city are required" });
    }

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

    const boundaries = wardBoundaries
      .filter((ward) => ward.geom && ward.geom.length > 0)
      .map((ward) => {
        let geoJson = null;
        if (ward.geom) {
          try {
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

    res.json(boundaries);
  } catch (error) {
    console.error("Error fetching ward boundaries:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
