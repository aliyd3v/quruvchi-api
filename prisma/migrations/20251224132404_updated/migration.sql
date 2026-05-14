-- DropForeignKey
ALTER TABLE "public"."Attachment" DROP CONSTRAINT "Attachment_inventory_id_fkey";

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "public"."Inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
