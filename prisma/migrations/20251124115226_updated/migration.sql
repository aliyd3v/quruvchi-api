/*
  Warnings:

  - You are about to alter the column `quantity` on the `TransactionItem` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,3)`.

*/
-- AlterTable
ALTER TABLE "public"."TransactionItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(10,3);
