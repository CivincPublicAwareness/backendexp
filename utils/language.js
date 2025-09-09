// Language validation utilities
let supportedLanguages = {};

// Load supported languages
try {
  supportedLanguages = require("../supported_languages.json");
} catch (error) {
  console.error("Error loading supported languages:", error);
}

// Language validation function
const validateLanguage = (language) => {
  // Check if language is provided and is a string
  if (!language || typeof language !== "string") {
    return { valid: false, error: "Language parameter is required" };
  }

  // Check if language length is exactly 2 characters
  if (language.length !== 2) {
    return {
      valid: false,
      error: "Language code must be exactly 2 characters",
    };
  }

  // Check if language exists in supported languages (O(1) lookup)
  if (!supportedLanguages[language]) {
    return { valid: false, error: "we don't have this language yet" };
  }

  return { valid: true };
};

// Normalize language code (e.g., 'hi' to 'hn' for Hindi)
const normalizeLanguage = (language) => {
  if (language === "hi") {
    return "hn"; // Map 'hi' to 'hn' for Hindi translations since our seed data uses 'hn'
  }
  return language;
};

module.exports = {
  validateLanguage,
  normalizeLanguage,
  supportedLanguages,
};
