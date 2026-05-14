/*
  Warnings:

  - A unique constraint covering the columns `[inventory_history_id]` on the table `TransactionItem` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."InventoryHistory" ADD COLUMN     "branch_id" INTEGER;

-- AlterTable
ALTER TABLE "public"."TransactionItem" ADD COLUMN     "inventory_history_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "TransactionItem_inventory_history_id_key" ON "public"."TransactionItem"("inventory_history_id");

-- AddForeignKey
ALTER TABLE "public"."TransactionItem" ADD CONSTRAINT "TransactionItem_inventory_history_id_fkey" FOREIGN KEY ("inventory_history_id") REFERENCES "public"."InventoryHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InventoryHistory" ADD CONSTRAINT "InventoryHistory_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
