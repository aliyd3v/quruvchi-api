-- AlterTable
ALTER TABLE "public"."InventoryHistory" ADD COLUMN     "executed_by_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."InventoryHistory" ADD CONSTRAINT "InventoryHistory_executed_by_id_fkey" FOREIGN KEY ("executed_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
