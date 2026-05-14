/*
  Warnings:

  - You are about to drop the `DebtAppliedPayment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DebtHistory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DebtHistoryItem` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."DebtAppliedPayment" DROP CONSTRAINT "DebtAppliedPayment_debt_history_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."DebtAppliedPayment" DROP CONSTRAINT "DebtAppliedPayment_debt_history_item_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."DebtHistory" DROP CONSTRAINT "DebtHistory_debtId_fkey";

-- DropForeignKey
ALTER TABLE "public"."DebtHistoryItem" DROP CONSTRAINT "DebtHistoryItem_debt_history_id_fkey";

-- DropTable
DROP TABLE "public"."DebtAppliedPayment";

-- DropTable
DROP TABLE "public"."DebtHistory";

-- DropTable
DROP TABLE "public"."DebtHistoryItem";
