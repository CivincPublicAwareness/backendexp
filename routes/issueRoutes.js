const express = require("express");
const {
  createIssue,
  fetchWardIssue,
} = require("../controllers/issueController");

const router = express.Router();

// Issue routes
router.post("/createIssue", createIssue);
router.get("/fetchIssue", fetchWardIssue);

module.exports = router;
