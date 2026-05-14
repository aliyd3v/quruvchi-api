-- AlterTable
ALTER TABLE "public"."Debt" ADD COLUMN     "callBefore" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "callLate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "smsBefore" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "smsLate" BOOLEAN NOT NULL DEFAULT false;
