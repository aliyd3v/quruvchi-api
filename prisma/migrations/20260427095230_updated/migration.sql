-- DropForeignKey
ALTER TABLE "public"."Catalog" DROP CONSTRAINT "Catalog_direction_id_fkey";

-- AddForeignKey
ALTER TABLE "public"."Catalog" ADD CONSTRAINT "Catalog_direction_id_fkey" FOREIGN KEY ("direction_id") REFERENCES "public"."CatalogDirection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
