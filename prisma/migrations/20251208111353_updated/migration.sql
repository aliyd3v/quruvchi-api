/*
  Warnings:

  - You are about to drop the column `contactPerson` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `fundingAmountCurrentYear` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `fundingSource` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `guaranteeAmount` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `lotBranch` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `lotEndDate` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `lotId` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `objectAddress` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `objectCityDistrict` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `objectComplexityCategory` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `objectId` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `objectRegion` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `organizationDirector` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `organizerName` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `programCategory` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `startingPrice` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `tenderFiles` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `tenderType` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `workDurationDays` on the `Lot` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Lot" DROP COLUMN "contactPerson",
DROP COLUMN "fundingAmountCurrentYear",
DROP COLUMN "fundingSource",
DROP COLUMN "guaranteeAmount",
DROP COLUMN "lotBranch",
DROP COLUMN "lotEndDate",
DROP COLUMN "lotId",
DROP COLUMN "objectAddress",
DROP COLUMN "objectCityDistrict",
DROP COLUMN "objectComplexityCategory",
DROP COLUMN "objectId",
DROP COLUMN "objectRegion",
DROP COLUMN "organizationDirector",
DROP COLUMN "organizerName",
DROP COLUMN "programCategory",
DROP COLUMN "startingPrice",
DROP COLUMN "tenderFiles",
DROP COLUMN "tenderType",
DROP COLUMN "workDurationDays",
ADD COLUMN     "contact_person" TEXT,
ADD COLUMN     "funding_amount_current_year" BIGINT,
ADD COLUMN     "funding_source" TEXT,
ADD COLUMN     "guarantee_amount" BIGINT,
ADD COLUMN     "lot_branch" TEXT,
ADD COLUMN     "lot_end_date" TEXT,
ADD COLUMN     "lot_id" TEXT,
ADD COLUMN     "object_address" TEXT,
ADD COLUMN     "object_city_district" TEXT,
ADD COLUMN     "object_complexity_category" TEXT,
ADD COLUMN     "object_id" TEXT,
ADD COLUMN     "object_region" TEXT,
ADD COLUMN     "organization_director" TEXT,
ADD COLUMN     "organizer_name" TEXT,
ADD COLUMN     "program_category" TEXT,
ADD COLUMN     "starting_price" BIGINT,
ADD COLUMN     "tender_files" TEXT,
ADD COLUMN     "tender_type" TEXT,
ADD COLUMN     "work_duration_days" INTEGER;
