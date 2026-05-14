-- AlterTable
ALTER TABLE "public"."InventoryHistory" ADD COLUMN     "object_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."InventoryHistory" ADD CONSTRAINT "InventoryHistory_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "public"."Object"("id") ON DELETE SET NULL ON UPDATE CASCADE;
