-- AlterTable
ALTER TABLE "issues" ADD COLUMN     "address_wrong" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "comments" VARCHAR(50),
ADD COLUMN     "name_wrong" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "number_wrong" BOOLEAN NOT NULL DEFAULT false;
