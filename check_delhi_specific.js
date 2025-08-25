const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function checkDelhiData() {
  try {
    console.log("Checking Delhi-specific data...\n");

    // Get Delhi city
    const delhiCity = await prisma.cities.findFirst({
      where: { code: "delhi" },
    });

    if (!delhiCity) {
      console.log("❌ Delhi city not found!");
      return;
    }

    console.log(
      `✅ Delhi city found: ${delhiCity.name} (ID: ${delhiCity.id})\n`
    );

    // Count Delhi wards
    const delhiWards = await prisma.wards.count({
      where: { city_id: delhiCity.id },
    });
    console.log(`📊 Delhi wards: ${delhiWards}`);

    // Count Delhi officials
    const delhiOfficials = await prisma.official.count({
      where: { city_id: delhiCity.id },
    });
    console.log(`👥 Delhi officials: ${delhiOfficials}`);

    // Check Delhi ward translations
    const delhiWardTranslations = await prisma.ward_translations.count({
      where: {
        ward: {
          city_id: delhiCity.id,
        },
      },
    });
    console.log(`🌐 Delhi ward translations: ${delhiWardTranslations}`);

    // Check Delhi official translations
    const delhiOfficialTranslations = await prisma.official_translations.count({
      where: {
        official: {
          city_id: delhiCity.id,
        },
      },
    });
    console.log(`🌐 Delhi official translations: ${delhiOfficialTranslations}`);

    // Sample Delhi wards
    const sampleWards = await prisma.wards.findMany({
      where: { city_id: delhiCity.id },
      take: 5,
      orderBy: { ward_no: "asc" },
    });

    console.log(`\n📋 Sample Delhi wards:`);
    sampleWards.forEach((ward) => {
      console.log(`  - Ward ${ward.ward_no}: ${ward.name}`);
    });

    // Sample Delhi officials
    const sampleOfficials = await prisma.official.findMany({
      where: { city_id: delhiCity.id },
      take: 5,
      orderBy: { name: "asc" },
    });

    console.log(`\n👤 Sample Delhi officials:`);
    sampleOfficials.forEach((official) => {
      console.log(
        `  - ${official.name} (${official.designation_code}) - Ward ${official.ward_id}`
      );
    });

    // Check languages for Delhi
    const delhiWardLanguages = await prisma.ward_translations.findMany({
      where: {
        ward: {
          city_id: delhiCity.id,
        },
      },
      select: {
        language: true,
      },
      distinct: ["language"],
    });

    console.log(`\n🌍 Languages available for Delhi:`);
    delhiWardLanguages.forEach((lang) => {
      console.log(`  - ${lang.language}`);
    });
  } catch (error) {
    console.error("Error checking Delhi data:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDelhiData();
