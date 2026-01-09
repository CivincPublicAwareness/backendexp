const express = require("express");
const { adminLogin, verifyAdminToken } = require("../controllers/adminController");

const router = express.Router();

// Admin authentication routes
router.post("/login", adminLogin);
router.get("/verify", verifyAdminToken);

module.exports = router;

