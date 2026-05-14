/*
  Warnings:

  - Added the required column `end_date` to the `Object` table without a default value. This is not possible if the table is not empty.
  - Added the required column `start_date` to the `Object` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Object" ADD COLUMN     "end_date" TIMESTAMPTZ(6) NOT NULL,
ADD COLUMN     "start_date" TIMESTAMPTZ(6) NOT NULL;
