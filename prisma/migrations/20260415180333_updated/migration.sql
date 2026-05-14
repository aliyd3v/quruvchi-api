/*
  Warnings:

  - You are about to drop the column `sortOrder` on the `ServiceSection` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."ServiceSection" DROP COLUMN "sortOrder",
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."Services" ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;
