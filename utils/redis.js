const { createClient } = require("redis");

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  retry_strategy: (options) => {
    if (options.error && options.error.code === "ECONNREFUSED") {
      console.error("Redis server connection refused");
      return new Error("Redis server connection refused");
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
      console.error("Redis retry time exhausted");
      return new Error("Redis retry time exhausted");
    }
    if (options.attempt > 10) {
      console.error("Redis max retry attempts reached");
      return undefined;
    }
    return Math.min(options.attempt * 100, 3000);
  },
});

redisClient.on("error", (err) => {
  console.error("Redis Client Error:", err);
});

redisClient.on("connect", () => {
  console.log("✅ Redis Client Connected");
});

redisClient.on("ready", () => {
  console.log("✅ Redis Client Ready");
});

redisClient.on("end", () => {
  console.log("❌ Redis Client Connection Ended");
});

// Connect to Redis
(async () => {
  try {
    await redisClient.connect();
    console.log("✅ Redis connection established");
  } catch (error) {
    console.error("❌ Redis connection failed:", error);
    console.log(
      "⚠️  Falling back to in-memory cache (not recommended for production)"
    );
  }
})();

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("🛑 Shutting down server...");
  try {
    await redisClient.quit();
    console.log("✅ Redis disconnected");
  } catch (error) {
    console.error("❌ Error disconnecting Redis:", error);
  }
});

process.on("SIGTERM", async () => {
  console.log("🛑 Received SIGTERM, shutting down gracefully...");
  try {
    await redisClient.quit();
  } catch (error) {
    console.error("❌ Error during graceful shutdown:", error);
  }
});

module.exports = redisClient;
