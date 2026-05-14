/*
  Warnings:

  - You are about to drop the column `isSendDebtReminder` on the `Debt` table. All the data in the column will be lost.
  - You are about to drop the column `isSendSms` on the `Debt` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Debt" DROP COLUMN "isSendDebtReminder",
DROP COLUMN "isSendSms";
