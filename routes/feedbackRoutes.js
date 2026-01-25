const express = require("express");
const {
  submitFeedback,
  getFeedback,
  getAllFeedbacks,
  updateFeedbackStatus,
} = require("../controllers/feedbackController");

const router = express.Router();

// Feedback routes
router.post("/submit", submitFeedback);
router.get("/:id", getFeedback); // Get by database ID (admin)
router.patch("/:id/status", updateFeedbackStatus); // Update status (admin)
router.get("/", getAllFeedbacks); // Get all (admin)

module.exports = router;
