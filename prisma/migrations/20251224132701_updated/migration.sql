-- DropForeignKey
ALTER TABLE "public"."InventoryHistory" DROP CONSTRAINT "InventoryHistory_inventary_id_fkey";

-- AddForeignKey
ALTER TABLE "public"."InventoryHistory" ADD CONSTRAINT "InventoryHistory_inventary_id_fkey" FOREIGN KEY ("inventary_id") REFERENCES "public"."Inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
