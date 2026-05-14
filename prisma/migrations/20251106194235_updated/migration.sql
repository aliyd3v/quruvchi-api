-- CreateEnum
CREATE TYPE "public"."CounterPartyType" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- AlterTable
ALTER TABLE "public"."Debt" ADD COLUMN     "counterPartyType" "public"."CounterPartyType" DEFAULT 'INDIVIDUAL';
