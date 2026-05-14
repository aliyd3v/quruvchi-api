-- AlterTable
ALTER TABLE "public"."Debt" ADD COLUMN     "isSendDebtReminder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSendSms" BOOLEAN NOT NULL DEFAULT false;
