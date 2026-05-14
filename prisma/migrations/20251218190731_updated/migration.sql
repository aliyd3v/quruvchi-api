/*
  Warnings:

  - You are about to drop the column `product_name_id` on the `Object` table. All the data in the column will be lost.
  - You are about to drop the `ProductName` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Object" DROP CONSTRAINT "Object_product_name_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."ProductName" DROP CONSTRAINT "ProductName_createdById_fkey";

-- AlterTable
ALTER TABLE "public"."Object" DROP COLUMN "product_name_id";

-- DropTable
DROP TABLE "public"."ProductName";
