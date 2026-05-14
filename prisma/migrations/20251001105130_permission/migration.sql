/*
  Warnings:

  - You are about to drop the column `permission` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Project" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "permission",
ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];
