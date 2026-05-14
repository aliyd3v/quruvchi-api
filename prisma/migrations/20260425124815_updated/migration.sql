/*
  Warnings:

  - You are about to drop the column `name` on the `Catalog` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `CatalogDirection` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Catalog" DROP COLUMN "name";

-- AlterTable
ALTER TABLE "public"."CatalogDirection" DROP COLUMN "name";
