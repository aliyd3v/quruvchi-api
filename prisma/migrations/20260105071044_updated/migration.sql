/*
  Warnings:

  - You are about to drop the column `fundId` on the `User` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."User" DROP CONSTRAINT "User_fundId_fkey";

-- DropIndex
DROP INDEX "public"."User_fundId_key";

-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "fundId";
