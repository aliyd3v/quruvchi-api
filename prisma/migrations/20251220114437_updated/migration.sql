/*
  Warnings:

  - You are about to drop the column `callBefore` on the `Debt` table. All the data in the column will be lost.
  - You are about to drop the column `callLate` on the `Debt` table. All the data in the column will be lost.
  - You are about to drop the column `smsBefore` on the `Debt` table. All the data in the column will be lost.
  - You are about to drop the column `smsLate` on the `Debt` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Debt" DROP COLUMN "callBefore",
DROP COLUMN "callLate",
DROP COLUMN "smsBefore",
DROP COLUMN "smsLate",
ADD COLUMN     "call_before" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "call_late" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sms_before" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sms_late" BOOLEAN NOT NULL DEFAULT false;
