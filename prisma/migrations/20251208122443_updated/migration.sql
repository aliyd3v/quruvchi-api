/*
  Warnings:

  - The `proposal_submission_deadline` column on the `Lot` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."Lot" DROP COLUMN "proposal_submission_deadline",
ADD COLUMN     "proposal_submission_deadline" INTEGER;
