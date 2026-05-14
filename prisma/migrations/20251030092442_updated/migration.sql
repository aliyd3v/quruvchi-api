/*
  Warnings:

  - The values [M] on the enum `Unit` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `currency` on the `Contract` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `Debt` table. All the data in the column will be lost.
  - You are about to drop the column `paidAmount` on the `Debt` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `Fund` table. All the data in the column will be lost.
  - You are about to drop the column `current_balance` on the `Fund` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `Fund` table. All the data in the column will be lost.
  - You are about to drop the column `initial_amount` on the `Fund` table. All the data in the column will be lost.
  - You are about to drop the column `object_id` on the `Fund` table. All the data in the column will be lost.
  - You are about to drop the column `prorab_id` on the `Fund` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Fund` table. All the data in the column will be lost.
  - You are about to drop the column `superadmin_id` on the `Fund` table. All the data in the column will be lost.
  - You are about to drop the column `work_volume_id` on the `Fund` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `WorkVolume` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[fundId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."Unit_new" AS ENUM ('MF', 'M2', 'M3', 'TON', 'KG', 'L', 'PCS', 'H', 'DAY');
ALTER TABLE "public"."WorkVolume" ALTER COLUMN "unit" TYPE "public"."Unit_new" USING ("unit"::text::"public"."Unit_new");
ALTER TABLE "public"."AnswerToWorkVolume" ALTER COLUMN "unit" TYPE "public"."Unit_new" USING ("unit"::text::"public"."Unit_new");
ALTER TYPE "public"."Unit" RENAME TO "Unit_old";
ALTER TYPE "public"."Unit_new" RENAME TO "Unit";
DROP TYPE "public"."Unit_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "public"."Fund" DROP CONSTRAINT "Fund_object_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Fund" DROP CONSTRAINT "Fund_prorab_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Fund" DROP CONSTRAINT "Fund_superadmin_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Fund" DROP CONSTRAINT "Fund_work_volume_id_fkey";

-- DropIndex
DROP INDEX "public"."idx_fund_object";

-- DropIndex
DROP INDEX "public"."idx_fund_object_prorab";

-- AlterTable
ALTER TABLE "public"."Contract" DROP COLUMN "currency";

-- AlterTable
ALTER TABLE "public"."Debt" DROP COLUMN "currency",
DROP COLUMN "paidAmount",
ADD COLUMN     "paidAmunt" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."Fund" DROP COLUMN "currency",
DROP COLUMN "current_balance",
DROP COLUMN "description",
DROP COLUMN "initial_amount",
DROP COLUMN "object_id",
DROP COLUMN "prorab_id",
DROP COLUMN "status",
DROP COLUMN "superadmin_id",
DROP COLUMN "work_volume_id",
ADD COLUMN     "balance" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."Transaction" DROP COLUMN "currency";

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "fundId" INTEGER;

-- AlterTable
ALTER TABLE "public"."WorkVolume" DROP COLUMN "currency";

-- DropEnum
DROP TYPE "public"."FundStatus";

-- CreateIndex
CREATE UNIQUE INDEX "User_fundId_key" ON "public"."User"("fundId");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "public"."Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;
