/**
 * Admin Authentication Controller
 * Hardcoded credentials for admin login
 */

// Hardcoded admin credentials
const ADMIN_CREDENTIALS = {
  username: "admin",
  password: "civinc@2025",
};

/**
 * Admin login endpoint
 * POST /api/admin/login
 */
const adminLogin = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    // Check credentials (hardcoded)
    if (
      username === ADMIN_CREDENTIALS.username &&
      password === ADMIN_CREDENTIALS.password
    ) {
      // Generate a simple token (in production, use JWT)
      const token = Buffer.from(
        JSON.stringify({
          username: username,
          timestamp: Date.now(),
          role: "admin",
        })
      ).toString("base64");

      return res.status(200).json({
        success: true,
        message: "Login successful",
        data: {
          token,
          username,
        },
      });
    } else {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
    }
  } catch (error) {
    console.error("Admin login error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * Verify admin token endpoint
 * GET /api/admin/verify
 */
const verifyAdminToken = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const token = authHeader.split(" ")[1];

    try {
      // Decode token
      const decoded = JSON.parse(Buffer.from(token, "base64").toString());
      
      // Basic token validation (check if it has required fields)
      if (decoded.username && decoded.role === "admin") {
        return res.status(200).json({
          success: true,
          message: "Token is valid",
          data: {
            username: decoded.username,
          },
        });
      } else {
        return res.status(401).json({
          success: false,
          message: "Invalid token",
        });
      }
    } catch (decodeError) {
      return res.status(401).json({
        success: false,
        message: "Invalid token format",
      });
    }
  } catch (error) {
    console.error("Token verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  adminLogin,
  verifyAdminToken,
};

