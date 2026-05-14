/*
  Warnings:

  - The `object_id` column on the `Lot` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."Lot" DROP COLUMN "object_id",
ADD COLUMN     "object_id" INTEGER;
