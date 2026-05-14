-- AlterTable
ALTER TABLE "public"."Attachment" ADD COLUMN     "previewCatalogId" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_previewCatalogId_fkey" FOREIGN KEY ("previewCatalogId") REFERENCES "public"."Catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
