/*
  Warnings:

  - You are about to drop the column `text_en` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `text_ru` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `text_uz` on the `Project` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Project" DROP COLUMN "text_en",
DROP COLUMN "text_ru",
DROP COLUMN "text_uz",
ADD COLUMN     "location" TEXT;
