const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

if (!admin.apps.length) {
  let serviceAccount = null;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const filePath = path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, "utf8");
      serviceAccount = JSON.parse(fileContent);
    } else {
      throw new Error(
        `Firebase service account file not found at: ${filePath}`
      );
    }
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (error) {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT must be valid JSON. Use FIREBASE_SERVICE_ACCOUNT_PATH instead for file path."
      );
    }
  }

  if (!serviceAccount) {
    throw new Error(
      "Either FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_PATH environment variable is required"
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const verifyIdToken = async (idToken) => {
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    throw new Error("Invalid Firebase ID token");
  }
};

const extractPhoneNumber = (decodedToken) => {
  const phoneNumber = decodedToken.phone_number;
  if (!phoneNumber) {
    throw new Error("Phone number not found in token");
  }
  return phoneNumber.replace("+91", "");
};

module.exports = {
  verifyIdToken,
  extractPhoneNumber,
};

