const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const csv = require("csv-parser");

const prisma = new PrismaClient();

async function importWardGeomData() {
  try {
    console.log("Starting ward_geom data import...");

    // First, let's check if there's existing data
    const existingCount = await prisma.ward_geom.count();
    console.log(`Existing records in ward_geom table: ${existingCount}`);

    const records = [];

    // Read CSV file
    await new Promise((resolve, reject) => {
      fs.createReadStream("ward_geom.csv")
        .pipe(csv())
        .on("data", (row) => {
          // Parse the data according to the schema
          const record = {
            gid: parseInt(row.gid),
            ward_no: row.ward_no ? parseInt(row.ward_no) : null,
            ward_name: row.ward_name || null,
            city: row.city || null,
            geom: row.geom || null,
          };
          records.push(record);
        })
        .on("end", () => {
          console.log(`Read ${records.length} records from CSV`);
          resolve();
        })
        .on("error", (error) => {
          console.error("Error reading CSV:", error);
          reject(error);
        });
    });

    if (records.length === 0) {
      console.log("No records found in CSV file");
      return;
    }

    // Import data in smaller batches to avoid connection pool issues
    const batchSize = 10;
    let importedCount = 0;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      try {
        // Use createMany for better performance
        const result = await prisma.ward_geom.createMany({
          data: batch,
          skipDuplicates: true, // Skip if gid already exists
        });

        importedCount += result.count;
        console.log(
          `Imported batch ${Math.floor(i / batchSize) + 1}: ${
            result.count
          } records`
        );

        // Add a small delay to prevent overwhelming the database
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(
          `Error importing batch ${Math.floor(i / batchSize) + 1}:`,
          error
        );

        // If createMany fails, try individual inserts
        console.log("Trying individual inserts for this batch...");
        let individualCount = 0;

        for (const record of batch) {
          try {
            await prisma.ward_geom.upsert({
              where: { gid: record.gid },
              update: record,
              create: record,
            });
            individualCount++;
          } catch (individualError) {
            console.error(
              `Error inserting record with gid ${record.gid}:`,
              individualError
            );
          }
        }

        importedCount += individualCount;
        console.log(`Individual inserts completed: ${individualCount} records`);
      }
    }

    console.log(
      `Successfully imported ${importedCount} records to ward_geom table`
    );

    // Verify the import
    const finalCount = await prisma.ward_geom.count();
    console.log(`Final record count in ward_geom table: ${finalCount}`);
  } catch (error) {
    console.error("Error during import:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the import
importWardGeomData()
  .then(() => {
    console.log("Import completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Import failed:", error);
    process.exit(1);
  });
