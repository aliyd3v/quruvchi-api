/*
  Warnings:

  - You are about to drop the column `amount` on the `Catalog` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `CatalogItem` table. All the data in the column will be lost.
  - You are about to drop the column `parameter` on the `CatalogItem` table. All the data in the column will be lost.
  - You are about to drop the column `price_per_unit` on the `CatalogItem` table. All the data in the column will be lost.
  - You are about to drop the column `unit` on the `CatalogItem` table. All the data in the column will be lost.
  - Added the required column `material_id` to the `CatalogItem` table without a default value. This is not possible if the table is not empty.
  - Made the column `catalog_id` on table `CatalogItem` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."Catalog" DROP COLUMN "amount";

-- AlterTable
ALTER TABLE "public"."CatalogItem" DROP COLUMN "name",
DROP COLUMN "parameter",
DROP COLUMN "price_per_unit",
DROP COLUMN "unit",
ADD COLUMN     "material_id" INTEGER NOT NULL,
ALTER COLUMN "catalog_id" SET NOT NULL;

-- CreateTable
CREATE TABLE "public"."CatalogMaterial" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "parameter" TEXT,
    "price_per_unit" BIGINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "unit" "public"."Unit",
    "created_by_id" INTEGER,
    "deleted_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "CatalogMaterial_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."CatalogItem" ADD CONSTRAINT "CatalogItem_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."CatalogMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CatalogMaterial" ADD CONSTRAINT "CatalogMaterial_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CatalogMaterial" ADD CONSTRAINT "CatalogMaterial_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
