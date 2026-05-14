/*
  Warnings:

  - You are about to drop the column `isDollar` on the `Debt` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Catalog" ADD COLUMN     "is_visible" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."Debt" DROP COLUMN "isDollar",
ADD COLUMN     "is_dollar" BOOLEAN NOT NULL DEFAULT false;
