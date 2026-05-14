/*
  Warnings:

  - You are about to drop the column `assigned_to_id` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `end_date` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `start_date` on the `Lot` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Lot" DROP CONSTRAINT "Lot_assigned_to_id_fkey";

-- AlterTable
ALTER TABLE "public"."Lot" DROP COLUMN "assigned_to_id",
DROP COLUMN "description",
DROP COLUMN "end_date",
DROP COLUMN "start_date",
ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "customer" TEXT,
ADD COLUMN     "fundingAmountCurrentYear" BIGINT,
ADD COLUMN     "fundingSource" TEXT,
ADD COLUMN     "guaranteeAmount" BIGINT,
ADD COLUMN     "lotBranch" TEXT,
ADD COLUMN     "lotEndDate" TEXT,
ADD COLUMN     "lotId" TEXT,
ADD COLUMN     "objectAddress" TEXT,
ADD COLUMN     "objectCityDistrict" TEXT,
ADD COLUMN     "objectComplexityCategory" TEXT,
ADD COLUMN     "objectId" TEXT,
ADD COLUMN     "objectRegion" TEXT,
ADD COLUMN     "organizationDirector" TEXT,
ADD COLUMN     "organizerName" TEXT,
ADD COLUMN     "programCategory" TEXT,
ADD COLUMN     "proposal_submission_deadline" TEXT,
ADD COLUMN     "startingPrice" BIGINT,
ADD COLUMN     "tenderFiles" TEXT,
ADD COLUMN     "tenderType" TEXT,
ADD COLUMN     "workDurationDays" INTEGER;

-- CreateTable
CREATE TABLE "public"."_LotToUser" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_LotToUser_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_LotToUser_B_index" ON "public"."_LotToUser"("B");

-- AddForeignKey
ALTER TABLE "public"."_LotToUser" ADD CONSTRAINT "_LotToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_LotToUser" ADD CONSTRAINT "_LotToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
