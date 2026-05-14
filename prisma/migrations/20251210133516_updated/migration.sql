/*
  Warnings:

  - The `lot_end_date` column on the `Lot` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."Lot" DROP COLUMN "lot_end_date",
ADD COLUMN     "lot_end_date" TIMESTAMPTZ(6);
