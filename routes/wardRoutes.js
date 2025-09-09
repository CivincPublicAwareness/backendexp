const express = require("express");
const {
  fetchWard,
  fetchWardWithLocation,
} = require("../controllers/wardController");

const router = express.Router();

// Ward routes
router.get("/fetchWard", fetchWard);
router.get("/fetchWardWithLocation", fetchWardWithLocation);

module.exports = router;
