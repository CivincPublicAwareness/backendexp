const express = require("express");
const {
  fetchWard,
  fetchWardWithLocation,
  fetchCityOfficers,
} = require("../controllers/wardController");

const router = express.Router();

// Ward routes
router.get("/fetchWard", fetchWard);
router.get("/fetchWardWithLocation", fetchWardWithLocation);
router.get("/fetchCityOfficers", fetchCityOfficers);

module.exports = router;
