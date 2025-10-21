const cors = require("cors");

// CORS configuration for development
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests only from localhost:5173 and civinc.in
    if (
      !origin ||
      origin === "http://localhost:5173" ||
      origin === "http://localhost:4173" ||
      origin === "https://civinc.in"
    ) {
      return callback(null, true);
    }

    // Reject all other origins
    return callback(new Error("Not allowed by CORS"), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
    "Access-Control-Request-Method",
    "Access-Control-Request-Headers",
  ],
  exposedHeaders: ["Content-Range", "X-Content-Range"],
  optionsSuccessStatus: 200, // Some legacy browsers choke on 204
};

// CORS middleware
const corsMiddleware = cors(corsOptions);

// Handle preflight requests
const preflightHandler = (req, res, next) => {
  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS, PATCH"
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With, Accept, Origin"
    );
    res.header("Access-Control-Allow-Credentials", "true");
    res.sendStatus(200);
  } else {
    next();
  }
};

// Add CORS headers to all responses (backup)
const corsHeaders = (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS, PATCH"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin"
  );
  res.header("Access-Control-Allow-Credentials", "true");
  next();
};

module.exports = {
  corsMiddleware,
  preflightHandler,
  corsHeaders,
};
