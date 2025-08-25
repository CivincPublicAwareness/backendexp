-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateTable
CREATE TABLE "states" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" SERIAL NOT NULL,
    "state_id" INTEGER NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wards" (
    "id" SERIAL NOT NULL,
    "city_id" INTEGER NOT NULL,
    "ward_no" INTEGER NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ward_translations" (
    "id" SERIAL NOT NULL,
    "ward_id" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ward_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boundary_sets" (
    "id" SERIAL NOT NULL,
    "city_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "srid" INTEGER,
    "source" TEXT,
    "vintage_year" INTEGER,
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boundary_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ward_boundaries" (
    "id" SERIAL NOT NULL,
    "city_id" INTEGER NOT NULL,
    "ward_id" INTEGER NOT NULL,
    "boundary_set_id" INTEGER NOT NULL,
    "geom" TEXT,
    "bbox" TEXT,
    "centroid" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ward_boundaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supported_languages" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "native_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supported_languages_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" SERIAL NOT NULL,
    "city_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_translations" (
    "id" SERIAL NOT NULL,
    "department_id" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "department_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designations" (
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "designations_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "designation_translations" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "designation_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official" (
    "id" SERIAL NOT NULL,
    "city_id" INTEGER NOT NULL,
    "ward_id" INTEGER NOT NULL,
    "department_id" INTEGER NOT NULL,
    "designation_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone_number" TEXT,
    "email" TEXT,
    "party" TEXT,
    "pincode" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "official_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_translations" (
    "id" SERIAL NOT NULL,
    "official_id" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ward_directory_cache" (
    "id" SERIAL NOT NULL,
    "ward_id" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "version" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ward_directory_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_localized" (
    "id" SERIAL NOT NULL,
    "official_id" INTEGER NOT NULL,
    "ward_id" INTEGER NOT NULL,
    "department_id" INTEGER NOT NULL,
    "designation_code" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "designation_title" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone_number" TEXT,
    "email" TEXT,
    "party" TEXT,
    "is_active" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "official_localized_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" SERIAL NOT NULL,
    "ward_id" INTEGER NOT NULL,
    "department_id" INTEGER,
    "ip" TEXT NOT NULL,
    "location" TEXT,
    "message" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issueId" VARCHAR(12) NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'medium',
    "category" TEXT,
    "assigned_official_id" INTEGER,
    "city" TEXT,
    "ward_name" TEXT,
    "designation" TEXT,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_translations" (
    "id" SERIAL NOT NULL,
    "issue_id" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issue_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics" (
    "id" SERIAL NOT NULL,
    "ward_no" INTEGER NOT NULL,
    "ward_name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,

    CONSTRAINT "analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Test" (
    "id" INTEGER NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Test_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ward_geom" (
    "gid" INTEGER NOT NULL,
    "ward_no" INTEGER,
    "ward_name" VARCHAR(255),
    "city" VARCHAR(255),
    "geom" TEXT,

    CONSTRAINT "ward_geom_pkey" PRIMARY KEY ("gid")
);

-- CreateTable
CREATE TABLE "city_translations" (
    "id" SERIAL NOT NULL,
    "city_id" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "city_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "state_translations" (
    "id" SERIAL NOT NULL,
    "state_id" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "state_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "states_code_key" ON "states"("code");

-- CreateIndex
CREATE INDEX "states_code_idx" ON "states"("code");

-- CreateIndex
CREATE INDEX "states_name_idx" ON "states"("name");

-- CreateIndex
CREATE UNIQUE INDEX "cities_code_key" ON "cities"("code");

-- CreateIndex
CREATE INDEX "cities_state_id_idx" ON "cities"("state_id");

-- CreateIndex
CREATE INDEX "cities_name_idx" ON "cities"("name");

-- CreateIndex
CREATE INDEX "wards_city_id_ward_no_idx" ON "wards"("city_id", "ward_no");

-- CreateIndex
CREATE INDEX "wards_city_id_idx" ON "wards"("city_id");

-- CreateIndex
CREATE UNIQUE INDEX "wards_city_id_ward_no_key" ON "wards"("city_id", "ward_no");

-- CreateIndex
CREATE INDEX "ward_translations_language_idx" ON "ward_translations"("language");

-- CreateIndex
CREATE INDEX "ward_translations_ward_id_idx" ON "ward_translations"("ward_id");

-- CreateIndex
CREATE UNIQUE INDEX "ward_translations_ward_id_language_key" ON "ward_translations"("ward_id", "language");

-- CreateIndex
CREATE INDEX "boundary_sets_city_id_idx" ON "boundary_sets"("city_id");

-- CreateIndex
CREATE INDEX "boundary_sets_vintage_year_idx" ON "boundary_sets"("vintage_year");

-- CreateIndex
CREATE INDEX "boundary_sets_effective_from_idx" ON "boundary_sets"("effective_from");

-- CreateIndex
CREATE INDEX "boundary_sets_effective_to_idx" ON "boundary_sets"("effective_to");

-- CreateIndex
CREATE UNIQUE INDEX "boundary_sets_city_id_code_key" ON "boundary_sets"("city_id", "code");

-- CreateIndex
CREATE INDEX "ward_boundaries_city_id_boundary_set_id_idx" ON "ward_boundaries"("city_id", "boundary_set_id");

-- CreateIndex
CREATE INDEX "ward_boundaries_city_id_ward_id_idx" ON "ward_boundaries"("city_id", "ward_id");

-- CreateIndex
CREATE INDEX "ward_boundaries_boundary_set_id_idx" ON "ward_boundaries"("boundary_set_id");

-- CreateIndex
CREATE INDEX "ward_boundaries_ward_id_idx" ON "ward_boundaries"("ward_id");

-- CreateIndex
CREATE UNIQUE INDEX "ward_boundaries_ward_id_boundary_set_id_key" ON "ward_boundaries"("ward_id", "boundary_set_id");

-- CreateIndex
CREATE INDEX "supported_languages_is_active_idx" ON "supported_languages"("is_active");

-- CreateIndex
CREATE INDEX "supported_languages_created_at_idx" ON "supported_languages"("created_at");

-- CreateIndex
CREATE INDEX "departments_city_id_idx" ON "departments"("city_id");

-- CreateIndex
CREATE INDEX "departments_code_idx" ON "departments"("code");

-- CreateIndex
CREATE INDEX "departments_is_active_idx" ON "departments"("is_active");

-- CreateIndex
CREATE INDEX "departments_created_at_idx" ON "departments"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "departments_city_id_code_key" ON "departments"("city_id", "code");

-- CreateIndex
CREATE INDEX "department_translations_department_id_idx" ON "department_translations"("department_id");

-- CreateIndex
CREATE INDEX "department_translations_language_idx" ON "department_translations"("language");

-- CreateIndex
CREATE INDEX "department_translations_created_at_idx" ON "department_translations"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "department_translations_department_id_language_key" ON "department_translations"("department_id", "language");

-- CreateIndex
CREATE INDEX "designation_translations_code_idx" ON "designation_translations"("code");

-- CreateIndex
CREATE INDEX "designation_translations_language_idx" ON "designation_translations"("language");

-- CreateIndex
CREATE UNIQUE INDEX "designation_translations_code_language_key" ON "designation_translations"("code", "language");

-- CreateIndex
CREATE INDEX "official_city_id_ward_id_idx" ON "official"("city_id", "ward_id");

-- CreateIndex
CREATE INDEX "official_department_id_idx" ON "official"("department_id");

-- CreateIndex
CREATE INDEX "official_designation_code_city_id_idx" ON "official"("designation_code", "city_id");

-- CreateIndex
CREATE INDEX "official_ward_id_designation_code_idx" ON "official"("ward_id", "designation_code");

-- CreateIndex
CREATE INDEX "official_party_city_id_idx" ON "official"("party", "city_id");

-- CreateIndex
CREATE INDEX "official_is_active_idx" ON "official"("is_active");

-- CreateIndex
CREATE INDEX "official_created_at_idx" ON "official"("created_at");

-- CreateIndex
CREATE INDEX "official_updated_at_idx" ON "official"("updated_at");

-- CreateIndex
CREATE INDEX "official_pincode_idx" ON "official"("pincode");

-- CreateIndex
CREATE INDEX "official_city_id_ward_id_department_id_is_active_idx" ON "official"("city_id", "ward_id", "department_id", "is_active");

-- CreateIndex
CREATE INDEX "official_city_id_ward_id_department_id_designation_code_is__idx" ON "official"("city_id", "ward_id", "department_id", "designation_code", "is_active");

-- CreateIndex
CREATE INDEX "official_ward_id_is_active_department_id_designation_code_idx" ON "official"("ward_id", "is_active", "department_id", "designation_code");

-- CreateIndex
CREATE UNIQUE INDEX "official_ward_id_department_id_designation_code_key" ON "official"("ward_id", "department_id", "designation_code");

-- CreateIndex
CREATE INDEX "official_translations_official_id_idx" ON "official_translations"("official_id");

-- CreateIndex
CREATE INDEX "official_translations_language_idx" ON "official_translations"("language");

-- CreateIndex
CREATE INDEX "official_translations_created_at_idx" ON "official_translations"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "official_translations_official_id_language_key" ON "official_translations"("official_id", "language");

-- CreateIndex
CREATE INDEX "ward_directory_cache_language_idx" ON "ward_directory_cache"("language");

-- CreateIndex
CREATE INDEX "ward_directory_cache_updated_at_idx" ON "ward_directory_cache"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "ward_directory_cache_ward_id_language_key" ON "ward_directory_cache"("ward_id", "language");

-- CreateIndex
CREATE INDEX "official_localized_ward_id_language_department_id_designati_idx" ON "official_localized"("ward_id", "language", "department_id", "designation_code", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "official_localized_official_id_language_key" ON "official_localized"("official_id", "language");

-- CreateIndex
CREATE UNIQUE INDEX "issues_issueId_key" ON "issues"("issueId");

-- CreateIndex
CREATE INDEX "issues_ward_id_resolved_idx" ON "issues"("ward_id", "resolved");

-- CreateIndex
CREATE INDEX "issues_created_at_idx" ON "issues"("created_at");

-- CreateIndex
CREATE INDEX "issues_resolved_created_at_idx" ON "issues"("resolved", "created_at");

-- CreateIndex
CREATE INDEX "issues_department_id_idx" ON "issues"("department_id");

-- CreateIndex
CREATE INDEX "issues_priority_created_at_idx" ON "issues"("priority", "created_at");

-- CreateIndex
CREATE INDEX "issues_category_department_id_idx" ON "issues"("category", "department_id");

-- CreateIndex
CREATE INDEX "idx_issues_city" ON "issues"("city");

-- CreateIndex
CREATE INDEX "idx_issues_ward_name" ON "issues"("ward_name");

-- CreateIndex
CREATE INDEX "issue_translations_issue_id_idx" ON "issue_translations"("issue_id");

-- CreateIndex
CREATE INDEX "issue_translations_language_idx" ON "issue_translations"("language");

-- CreateIndex
CREATE INDEX "issue_translations_created_at_idx" ON "issue_translations"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "issue_translations_issue_id_language_key" ON "issue_translations"("issue_id", "language");

-- CreateIndex
CREATE INDEX "analytics_city_ward_no_idx" ON "analytics"("city", "ward_no");

-- CreateIndex
CREATE INDEX "analytics_created_at_idx" ON "analytics"("created_at");

-- CreateIndex
CREATE INDEX "analytics_city_created_at_idx" ON "analytics"("city", "created_at");

-- CreateIndex
CREATE INDEX "analytics_ward_no_created_at_idx" ON "analytics"("ward_no", "created_at");

-- CreateIndex
CREATE INDEX "analytics_device_created_at_idx" ON "analytics"("device", "created_at");

-- CreateIndex
CREATE INDEX "analytics_browser_created_at_idx" ON "analytics"("browser", "created_at");

-- CreateIndex
CREATE INDEX "idx_ward_geom_city_ward" ON "ward_geom"("city", "ward_no");

-- CreateIndex
CREATE INDEX "idx_ward_geom_gid" ON "ward_geom"("gid");

-- CreateIndex
CREATE INDEX "city_translations_city_id_idx" ON "city_translations"("city_id");

-- CreateIndex
CREATE INDEX "city_translations_language_idx" ON "city_translations"("language");

-- CreateIndex
CREATE UNIQUE INDEX "city_translations_city_id_language_key" ON "city_translations"("city_id", "language");

-- CreateIndex
CREATE INDEX "state_translations_language_idx" ON "state_translations"("language");

-- CreateIndex
CREATE INDEX "state_translations_state_id_idx" ON "state_translations"("state_id");

-- CreateIndex
CREATE UNIQUE INDEX "state_translations_state_id_language_key" ON "state_translations"("state_id", "language");

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wards" ADD CONSTRAINT "wards_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ward_translations" ADD CONSTRAINT "ward_translations_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "wards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boundary_sets" ADD CONSTRAINT "boundary_sets_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ward_boundaries" ADD CONSTRAINT "ward_boundaries_boundary_set_id_fkey" FOREIGN KEY ("boundary_set_id") REFERENCES "boundary_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ward_boundaries" ADD CONSTRAINT "ward_boundaries_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ward_boundaries" ADD CONSTRAINT "ward_boundaries_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "wards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_translations" ADD CONSTRAINT "department_translations_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designation_translations" ADD CONSTRAINT "designation_translations_code_fkey" FOREIGN KEY ("code") REFERENCES "designations"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official" ADD CONSTRAINT "official_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official" ADD CONSTRAINT "official_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official" ADD CONSTRAINT "official_designation_code_fkey" FOREIGN KEY ("designation_code") REFERENCES "designations"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official" ADD CONSTRAINT "official_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "wards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_translations" ADD CONSTRAINT "official_translations_official_id_fkey" FOREIGN KEY ("official_id") REFERENCES "official"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ward_directory_cache" ADD CONSTRAINT "ward_directory_cache_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "wards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_localized" ADD CONSTRAINT "official_localized_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_localized" ADD CONSTRAINT "official_localized_designation_code_fkey" FOREIGN KEY ("designation_code") REFERENCES "designations"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_localized" ADD CONSTRAINT "official_localized_official_id_fkey" FOREIGN KEY ("official_id") REFERENCES "official"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_localized" ADD CONSTRAINT "official_localized_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "wards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_assigned_official_id_fkey" FOREIGN KEY ("assigned_official_id") REFERENCES "official"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "wards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_translations" ADD CONSTRAINT "issue_translations_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "city_translations" ADD CONSTRAINT "city_translations_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "state_translations" ADD CONSTRAINT "state_translations_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE CASCADE ON UPDATE CASCADE;
