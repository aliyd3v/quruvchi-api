/*
  Warnings:

  - You are about to drop the column `projectCategoryId` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the `ProjectCategory` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Project" DROP CONSTRAINT "Project_projectCategoryId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ProjectCategory" DROP CONSTRAINT "ProjectCategory_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."ProjectCategory" DROP CONSTRAINT "ProjectCategory_deleted_by_id_fkey";

-- AlterTable
ALTER TABLE "public"."Project" DROP COLUMN "projectCategoryId";

-- DropTable
DROP TABLE "public"."ProjectCategory";

-- CreateTable
CREATE TABLE "public"."ServiceSection" (
    "id" SERIAL NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "titleUz" TEXT NOT NULL,
    "titleRu" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServiceSection_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."ServiceSection" ADD CONSTRAINT "ServiceSection_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "public"."Services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
