/*
  Warnings:

  - You are about to drop the column `has_invoice` on the `Entry` table. All the data in the column will be lost.
  - Added the required column `type` to the `Entry` table without a default value. This is not possible if the table is not empty.
  - Made the column `invoiceStatus` on table `Entry` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "public"."EntryType" AS ENUM ('EXPENSE', 'INCOME');

-- AlterTable
ALTER TABLE "public"."Entry" DROP COLUMN "has_invoice",
ADD COLUMN     "type" "public"."EntryType" NOT NULL,
ALTER COLUMN "invoiceStatus" SET NOT NULL;
