/*
  Warnings:

  - You are about to alter the column `quantity` on the `Task` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,3)`.
  - You are about to alter the column `quantity_of_complated` on the `Task` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,3)`.

*/
-- AlterTable
ALTER TABLE "public"."Task" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(10,3),
ALTER COLUMN "quantity_of_complated" SET DEFAULT 0,
ALTER COLUMN "quantity_of_complated" SET DATA TYPE DECIMAL(10,3);
