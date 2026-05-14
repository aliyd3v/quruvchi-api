-- AlterTable
ALTER TABLE "public"."SalaryMonth" ADD COLUMN     "paidPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "remainingPercent" INTEGER NOT NULL DEFAULT 100;
