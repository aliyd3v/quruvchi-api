/*
  Warnings:

  - You are about to drop the column `price_per_unit` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `product_name` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `technical_parameters` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `unit` on the `Transaction` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Transaction" DROP COLUMN "price_per_unit",
DROP COLUMN "product_name",
DROP COLUMN "quantity",
DROP COLUMN "technical_parameters",
DROP COLUMN "unit";
