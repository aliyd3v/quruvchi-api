/*
  Warnings:

  - You are about to drop the column `object_id` on the `Lot` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Lot" DROP CONSTRAINT "Lot_object_id_fkey";

-- AlterTable
ALTER TABLE "public"."Lot" DROP COLUMN "object_id";
