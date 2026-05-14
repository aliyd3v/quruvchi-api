/*
  Warnings:

  - You are about to drop the column `inventory_history_id` on the `TransactionItem` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[transaction_item_id]` on the table `InventoryHistory` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "public"."TransactionItem" DROP CONSTRAINT "TransactionItem_inventory_history_id_fkey";

-- DropIndex
DROP INDEX "public"."TransactionItem_inventory_history_id_key";

-- AlterTable
ALTER TABLE "public"."InventoryHistory" ADD COLUMN     "transaction_item_id" INTEGER;

-- AlterTable
ALTER TABLE "public"."TransactionItem" DROP COLUMN "inventory_history_id";

-- CreateIndex
CREATE UNIQUE INDEX "InventoryHistory_transaction_item_id_key" ON "public"."InventoryHistory"("transaction_item_id");

-- AddForeignKey
ALTER TABLE "public"."InventoryHistory" ADD CONSTRAINT "InventoryHistory_transaction_item_id_fkey" FOREIGN KEY ("transaction_item_id") REFERENCES "public"."TransactionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
