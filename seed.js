const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

async function seedDatabase() {
  try {
    console.log("Starting database seeding...");

    // Read the seed data
    const seedData = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "seed_nanjangud_transliterated_v3.json"),
        "utf8"
      )
    );

    // 1. Create supported languages
    console.log("Creating supported languages...");
    for (const language of seedData.supported_languages) {
      await prisma.supported_languages.upsert({
        where: { code: language.code },
        update: language,
        create: language,
      });
    }

    // 2. Create state
    console.log("Creating state...");
    const state = await prisma.states.upsert({
      where: { code: seedData.state.code },
      update: seedData.state,
      create: seedData.state,
    });

    // 3. Create city
    console.log("Creating city...");
    const city = await prisma.cities.upsert({
      where: { code: seedData.city.code },
      update: {
        ...seedData.city,
        state_id: state.id,
      },
      create: {
        ...seedData.city,
        state_id: state.id,
      },
    });

    // 4. Create state translations
    console.log("Creating state translations...");
    for (const translation of seedData.state_translations) {
      await prisma.state_translations.upsert({
        where: {
          state_id_language: {
            state_id: state.id,
            language: translation.language,
          },
        },
        update: {
          ...translation,
          state_id: state.id,
        },
        create: {
          ...translation,
          state_id: state.id,
        },
      });
    }

    // 5. Create city translations
    console.log("Creating city translations...");
    for (const translation of seedData.city_translations) {
      await prisma.city_translations.upsert({
        where: {
          city_id_language: {
            city_id: city.id,
            language: translation.language,
          },
        },
        update: {
          ...translation,
          city_id: city.id,
        },
        create: {
          ...translation,
          city_id: city.id,
        },
      });
    }

    // 6. Create wards
    console.log("Creating wards...");
    const wardMap = new Map();
    for (const ward of seedData.wards) {
      const createdWard = await prisma.wards.upsert({
        where: {
          city_id_ward_no: {
            city_id: city.id,
            ward_no: ward.ward_no,
          },
        },
        update: {
          ...ward,
          city_id: city.id,
        },
        create: {
          ...ward,
          city_id: city.id,
        },
      });
      wardMap.set(ward.ward_no, createdWard);
    }

    // 7. Create departments
    console.log("Creating departments...");
    const departmentMap = new Map();
    for (const dept of seedData.departments) {
      const createdDept = await prisma.departments.upsert({
        where: {
          city_id_code: {
            city_id: city.id,
            code: dept.code,
          },
        },
        update: {
          code: dept.code,
          city_id: city.id,
        },
        create: {
          code: dept.code,
          city_id: city.id,
        },
      });
      departmentMap.set(dept.code, createdDept);
    }

    // 8. Create designations
    console.log("Creating designations...");
    const designationMap = new Map();
    for (const designation of seedData.designations) {
      const createdDesignation = await prisma.designations.upsert({
        where: { code: designation.code },
        update: { code: designation.code },
        create: { code: designation.code },
      });
      designationMap.set(designation.code, createdDesignation);
    }

    // 9. Create department translations
    console.log("Creating department translations...");
    for (const translation of seedData.department_translations) {
      const department = departmentMap.get(translation.department_code);
      if (department) {
        await prisma.department_translations.upsert({
          where: {
            department_id_language: {
              department_id: department.id,
              language: translation.language,
            },
          },
          update: {
            language: translation.language,
            name: translation.name,
            description: translation.description,
            department_id: department.id,
          },
          create: {
            language: translation.language,
            name: translation.name,
            description: translation.description,
            department_id: department.id,
          },
        });
      }
    }

    // 10. Create designation translations
    console.log("Creating designation translations...");
    for (const translation of seedData.designation_translations) {
      await prisma.designation_translations.upsert({
        where: {
          code_language: {
            code: translation.code,
            language: translation.language,
          },
        },
        update: translation,
        create: translation,
      });
    }

    // 11. Create ward translations
    console.log("Creating ward translations...");
    for (const translation of seedData.ward_translations) {
      const ward = wardMap.get(translation.ward_no);
      if (ward) {
        await prisma.ward_translations.upsert({
          where: {
            ward_id_language: {
              ward_id: ward.id,
              language: translation.language,
            },
          },
          update: {
            language: translation.language,
            name: translation.name,
            ward_id: ward.id,
          },
          create: {
            language: translation.language,
            name: translation.name,
            ward_id: ward.id,
          },
        });
      }
    }

    // 12. Create officials
    console.log("Creating officials...");
    const officialMap = new Map();

    // Create a mapping from department names to department codes
    const departmentNameToCode = new Map();
    for (const dept of seedData.departments) {
      departmentNameToCode.set(dept.name, dept.code);
    }

    for (const official of seedData.officials) {
      const ward = wardMap.get(official.ward_no);
      // Try to find department by code first, then by name mapping
      let department = departmentMap.get(official.department_code);
      if (!department && departmentNameToCode.has(official.department_code)) {
        const actualCode = departmentNameToCode.get(official.department_code);
        department = departmentMap.get(actualCode);
      }

      if (ward && department) {
        const createdOfficial = await prisma.official.upsert({
          where: {
            ward_id_department_id_designation_code: {
              ward_id: ward.id,
              department_id: department.id,
              designation_code: official.designation_code,
            },
          },
          update: {
            designation_code: official.designation_code,
            name: official.name,
            address: official.address,
            phone_number: official.phone_number,
            email: official.email,
            party: official.party,
            is_active: official.is_active,
            city_id: city.id,
            ward_id: ward.id,
            department_id: department.id,
          },
          create: {
            designation_code: official.designation_code,
            name: official.name,
            address: official.address,
            phone_number: official.phone_number,
            email: official.email,
            party: official.party,
            is_active: official.is_active,
            city_id: city.id,
            ward_id: ward.id,
            department_id: department.id,
          },
        });
        officialMap.set(
          `${official.ward_no}_${official.department_code}_${official.designation_code}`,
          createdOfficial
        );
      } else {
        console.log(
          `⚠️  Skipping official: ${official.name} - Ward: ${official.ward_no}, Department: ${official.department_code} - Not found`
        );
      }
    }

    // 13. Create official translations
    console.log("Creating official translations...");
    for (const translation of seedData.official_translations) {
      const ward = wardMap.get(translation.ward_no);
      // Try to find department by code first, then by name mapping
      let department = departmentMap.get(translation.department_code);
      if (
        !department &&
        departmentNameToCode.has(translation.department_code)
      ) {
        const actualCode = departmentNameToCode.get(
          translation.department_code
        );
        department = departmentMap.get(actualCode);
      }

      if (ward && department) {
        const official = officialMap.get(
          `${translation.ward_no}_${translation.department_code}_${translation.designation_code}`
        );

        if (official) {
          await prisma.official_translations.upsert({
            where: {
              official_id_language: {
                official_id: official.id,
                language: translation.language,
              },
            },
            update: {
              language: translation.language,
              name: translation.name,
              designation: translation.designation,
              address: translation.address,
              official_id: official.id,
            },
            create: {
              language: translation.language,
              name: translation.name,
              designation: translation.designation,
              address: translation.address,
              official_id: official.id,
            },
          });
        }
      }
    }

    console.log("Database seeding completed successfully!");
  } catch (error) {
    console.error("Error seeding database:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedDatabase()
  .then(() => {
    console.log("Seeding completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exit(1);
  });
