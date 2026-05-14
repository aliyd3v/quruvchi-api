/*
  Warnings:

  - You are about to drop the `InventoryAvatar` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."InventoryAvatar" DROP CONSTRAINT "InventoryAvatar_user_id_fkey";

-- AlterTable
ALTER TABLE "public"."Attachment" ADD COLUMN     "inventory_id" INTEGER;

-- DropTable
DROP TABLE "public"."InventoryAvatar";

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "public"."Inventory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
