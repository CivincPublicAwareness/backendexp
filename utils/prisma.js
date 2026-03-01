const { PrismaClient } = require("@prisma/client");

// Create a single shared Prisma client instance with optimized connection pooling
const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL +
        "?connection_limit=20&pool_timeout=20&connect_timeout=60",
    },
  },
  log: ["error", "warn"],
  // Optimize for production performance
  __internal: {
    engine: {
      // Enable connection pooling
      connectionLimit: 20,
      // Reduce connection overhead
      poolTimeout: 20,
      // Optimize query execution
      queryTimeout: 30000,
    },
  },
});

// Handle graceful shutdown
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = prisma;
