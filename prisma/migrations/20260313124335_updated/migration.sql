/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `CatalogDirection` will be added. If there are existing duplicate values, this will fail.
  - Made the column `name` on table `CatalogDirection` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."CatalogDirection" ALTER COLUMN "name" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CatalogDirection_name_key" ON "public"."CatalogDirection"("name");
