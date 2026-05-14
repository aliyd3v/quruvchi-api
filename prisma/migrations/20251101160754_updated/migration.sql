-- CreateEnum
CREATE TYPE "public"."DebtHistoryType" AS ENUM ('ADDED', 'PAID');

-- AlterEnum
ALTER TYPE "public"."DebtStatus" ADD VALUE 'OVERPAID';

-- AlterTable
ALTER TABLE "public"."Debt" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."DebtHistory" (
    "id" SERIAL NOT NULL,
    "amount" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "type" "public"."DebtHistoryType" NOT NULL,
    "debtId" INTEGER,

    CONSTRAINT "DebtHistory_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."DebtHistory" ADD CONSTRAINT "DebtHistory_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "public"."Debt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
