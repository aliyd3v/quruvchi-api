/*
  Warnings:

  - Added the required column `description_en` to the `News` table without a default value. This is not possible if the table is not empty.
  - Added the required column `description_ru` to the `News` table without a default value. This is not possible if the table is not empty.
  - Added the required column `description_uz` to the `News` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."News" ADD COLUMN     "description_en" TEXT NOT NULL,
ADD COLUMN     "description_ru" TEXT NOT NULL,
ADD COLUMN     "description_uz" TEXT NOT NULL;
