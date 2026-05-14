/*
  Warnings:

  - You are about to drop the column `fundId` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `fundId` on the `WorkVolume` table. All the data in the column will be lost.
  - You are about to drop the `Fund` table. If the table is not empty, all the data it contains will be lost.
  - Changed the type of `unit` on the `WorkVolume` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "public"."Unit" AS ENUM ('M', 'M2', 'M3', 'TON', 'KG', 'L', 'PCS', 'H', 'DAY');

-- DropForeignKey
ALTER TABLE "public"."Fund" DROP CONSTRAINT "Fund_objectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Fund" DROP CONSTRAINT "Fund_prorabId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Fund" DROP CONSTRAINT "Fund_superadminId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Transaction" DROP CONSTRAINT "Transaction_fundId_fkey";

-- DropForeignKey
ALTER TABLE "public"."WorkVolume" DROP CONSTRAINT "WorkVolume_fundId_fkey";

-- AlterTable
ALTER TABLE "public"."Transaction" DROP COLUMN "fundId";

-- AlterTable
ALTER TABLE "public"."WorkVolume" DROP COLUMN "fundId",
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'UZS',
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
DROP COLUMN "unit",
ADD COLUMN     "unit" "public"."Unit" NOT NULL;

-- DropTable
DROP TABLE "public"."Fund";

-- DropEnum
DROP TYPE "public"."FundStatus";
