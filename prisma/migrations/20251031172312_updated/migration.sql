/*
  Warnings:

  - You are about to drop the column `paidAmunt` on the `Debt` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Debt" DROP COLUMN "paidAmunt",
ADD COLUMN     "paidAmount" BIGINT NOT NULL DEFAULT 0;
