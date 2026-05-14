/*
  Warnings:

  - You are about to drop the column `userId` on the `Debt` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Debt" DROP CONSTRAINT "Debt_userId_fkey";

-- DropIndex
DROP INDEX "public"."Debt_userId_idx";

-- AlterTable
ALTER TABLE "public"."Debt" DROP COLUMN "userId";
