-- DropForeignKey
ALTER TABLE "public"."CatalogItem" DROP CONSTRAINT "CatalogItem_material_id_fkey";

-- AddForeignKey
ALTER TABLE "public"."CatalogItem" ADD CONSTRAINT "CatalogItem_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."CatalogMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;
