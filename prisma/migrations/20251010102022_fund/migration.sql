/*
  Warnings:

  - Added the required column `fundId` to the `Transaction` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."FundStatus" AS ENUM ('ACTIVE', 'CLOSED', 'RECONCILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "public"."Transaction" ADD COLUMN     "fundId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "public"."WorkVolume" ADD COLUMN     "fundId" INTEGER;

-- CreateTable
CREATE TABLE "public"."Fund" (
    "id" SERIAL NOT NULL,
    "objectId" INTEGER NOT NULL,
    "prorabId" INTEGER NOT NULL,
    "superadminId" INTEGER NOT NULL,
    "initialAmount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "description" TEXT,
    "status" "public"."FundStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Fund_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."WorkVolume" ADD CONSTRAINT "WorkVolume_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "public"."Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Fund" ADD CONSTRAINT "Fund_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "public"."Object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Fund" ADD CONSTRAINT "Fund_prorabId_fkey" FOREIGN KEY ("prorabId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Fund" ADD CONSTRAINT "Fund_superadminId_fkey" FOREIGN KEY ("superadminId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "public"."Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
