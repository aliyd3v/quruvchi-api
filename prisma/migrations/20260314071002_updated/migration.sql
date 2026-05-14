-- AlterTable
ALTER TABLE "public"."Attachment" ADD COLUMN     "catalog_direction_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_catalog_direction_id_fkey" FOREIGN KEY ("catalog_direction_id") REFERENCES "public"."CatalogDirection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
