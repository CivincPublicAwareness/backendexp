-- CreateTable
CREATE TABLE "complaint_categories" (
    "id" SERIAL NOT NULL,
    "department_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaint_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_category_translations" (
    "id" SERIAL NOT NULL,
    "complaint_category_id" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaint_category_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" SERIAL NOT NULL,
    "complaint_category_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_translations" (
    "id" SERIAL NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaint_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "complaint_categories_department_id_idx" ON "complaint_categories"("department_id");

-- CreateIndex
CREATE INDEX "complaint_categories_code_idx" ON "complaint_categories"("code");

-- CreateIndex
CREATE INDEX "complaint_categories_is_active_idx" ON "complaint_categories"("is_active");

-- CreateIndex
CREATE INDEX "complaint_categories_priority_idx" ON "complaint_categories"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "complaint_categories_department_id_code_key" ON "complaint_categories"("department_id", "code");

-- CreateIndex
CREATE INDEX "complaint_category_translations_complaint_category_id_idx" ON "complaint_category_translations"("complaint_category_id");

-- CreateIndex
CREATE INDEX "complaint_category_translations_language_idx" ON "complaint_category_translations"("language");

-- CreateIndex
CREATE UNIQUE INDEX "complaint_category_translations_complaint_category_id_langu_key" ON "complaint_category_translations"("complaint_category_id", "language");

-- CreateIndex
CREATE INDEX "complaints_complaint_category_id_idx" ON "complaints"("complaint_category_id");

-- CreateIndex
CREATE INDEX "complaints_code_idx" ON "complaints"("code");

-- CreateIndex
CREATE INDEX "complaints_is_active_idx" ON "complaints"("is_active");

-- CreateIndex
CREATE INDEX "complaints_priority_idx" ON "complaints"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "complaints_complaint_category_id_code_key" ON "complaints"("complaint_category_id", "code");

-- CreateIndex
CREATE INDEX "complaint_translations_complaint_id_idx" ON "complaint_translations"("complaint_id");

-- CreateIndex
CREATE INDEX "complaint_translations_language_idx" ON "complaint_translations"("language");

-- CreateIndex
CREATE UNIQUE INDEX "complaint_translations_complaint_id_language_key" ON "complaint_translations"("complaint_id", "language");

-- AddForeignKey
ALTER TABLE "complaint_categories" ADD CONSTRAINT "complaint_categories_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_category_translations" ADD CONSTRAINT "complaint_category_translations_complaint_category_id_fkey" FOREIGN KEY ("complaint_category_id") REFERENCES "complaint_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_complaint_category_id_fkey" FOREIGN KEY ("complaint_category_id") REFERENCES "complaint_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_translations" ADD CONSTRAINT "complaint_translations_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
