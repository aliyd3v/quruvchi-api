/*
  Warnings:

  - Added the required column `amount` to the `Debt` table without a default value. This is not possible if the table is not empty.
  - Added the required column `due_at` to the `Debt` table without a default value. This is not possible if the table is not empty.
  - Added the required column `issued_at` to the `Debt` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `Organization` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."DebtStatus" AS ENUM ('OPEN', 'PARTIAL', 'CLOSED', 'OVERDUE');

-- AlterTable
ALTER TABLE "public"."Debt" ADD COLUMN     "amount" BIGINT NOT NULL,
ADD COLUMN     "counterpartyName" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'UZS',
ADD COLUMN     "due_at" TIMESTAMPTZ(6) NOT NULL,
ADD COLUMN     "issued_at" TIMESTAMPTZ(6) NOT NULL,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "paidAmount" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "status" "public"."DebtStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "public"."Organization" ADD COLUMN     "created_by_id" INTEGER,
ADD COLUMN     "name" VARCHAR(255) NOT NULL;

-- AlterTable
ALTER TABLE "public"."Transaction" ADD COLUMN     "deleted_by_id" INTEGER,
ADD COLUMN     "organization_id" INTEGER;

-- CreateIndex
CREATE INDEX "Debt_userId_idx" ON "public"."Debt"("userId");

-- CreateIndex
CREATE INDEX "Debt_status_idx" ON "public"."Debt"("status");

-- CreateIndex
CREATE INDEX "Debt_due_at_idx" ON "public"."Debt"("due_at");

-- AddForeignKey
ALTER TABLE "public"."Organization" ADD CONSTRAINT "Organization_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Debt" ADD CONSTRAINT "Debt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
