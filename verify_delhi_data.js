const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function verifyDelhiData() {
  try {
    console.log("Verifying Delhi data import...\n");

    // Check states
    const states = await prisma.states.findMany();
    console.log(`States: ${states.length}`);
    states.forEach(state => console.log(`  - ${state.code}: ${state.name}`));

    // Check cities
    const cities = await prisma.cities.findMany();
    console.log(`\nCities: ${cities.length}`);
    cities.forEach(city => console.log(`  - ${city.code}: ${city.name}`));

    // Check wards
    const wards = await prisma.wards.findMany();
    console.log(`\nWards: ${wards.length}`);
    console.log(`  First 5 wards: ${wards.slice(0, 5).map(w => `${w.ward_no}: ${w.name}`).join(', ')}`);

    // Check departments
    const departments = await prisma.departments.findMany();
    console.log(`\nDepartments: ${departments.length}`);
    departments.forEach(dept => console.log(`  - ${dept.code}: ${dept.name}`));

    // Check designations
    const designations = await prisma.designations.findMany();
    console.log(`\nDesignations: ${designations.length}`);
    designations.forEach(desig => console.log(`  - ${desig.code}: ${desig.title}`));

    // Check officials
    const officials = await prisma.official.findMany();
    console.log(`\nOfficials: ${officials.length}`);
    console.log(`  First 5 officials: ${officials.slice(0, 5).map(o => `${o.name} (${o.designation_code})`).join(', ')}`);

    // Check translations
    const stateTranslations = await prisma.state_translations.findMany();
    const cityTranslations = await prisma.city_translations.findMany();
    const wardTranslations = await prisma.ward_translations.findMany();
    const deptTranslations = await prisma.department_translations.findMany();
    const desigTranslations = await prisma.designation_translations.findMany();
    const officialTranslations = await prisma.official_translations.findMany();

    console.log(`\nTranslations:`);
    console.log(`  State: ${stateTranslations.length}`);
    console.log(`  City: ${cityTranslations.length}`);
    console.log(`  Ward: ${wardTranslations.length}`);
    console.log(`  Department: ${deptTranslations.length}`);
    console.log(`  Designation: ${desigTranslations.length}`);
    console.log(`  Official: ${officialTranslations.length}`);

    // Check supported languages
    const languages = await prisma.supported_languages.findMany();
    console.log(`\nSupported Languages: ${languages.length}`);
    languages.forEach(lang => console.log(`  - ${lang.code}: ${lang.name} (${lang.native_name})`));

  } catch (error) {
    console.error("Error verifying data:", error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyDelhiData(); 