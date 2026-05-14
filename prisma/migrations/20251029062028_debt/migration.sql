-- CreateEnum
CREATE TYPE "public"."DebtType" AS ENUM ('BOROWWED', 'LEND');

-- AlterTable
ALTER TABLE "public"."Debt" ADD COLUMN     "counterpartyPhone" VARCHAR(20),
ADD COLUMN     "type" "public"."DebtType" NOT NULL DEFAULT 'LEND';
