/*
  Warnings:

  - You are about to drop the column `amount` on the `Object` table. All the data in the column will be lost.
  - You are about to drop the column `current_balance` on the `Object` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Object" DROP COLUMN "amount",
DROP COLUMN "current_balance",
ADD COLUMN     "balance" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "budget" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "total_expense" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "total_income" BIGINT NOT NULL DEFAULT 0;
