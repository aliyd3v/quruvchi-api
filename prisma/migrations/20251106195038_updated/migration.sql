/*
  Warnings:

  - Made the column `counterPartyType` on table `Debt` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."Debt" ALTER COLUMN "counterPartyType" SET NOT NULL,
ALTER COLUMN "counterPartyType" DROP DEFAULT;
