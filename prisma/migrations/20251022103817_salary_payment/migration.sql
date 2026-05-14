-- CreateEnum
CREATE TYPE "public"."SalaryMonthType" AS ENUM ('DAILY', 'MONTHLY');

-- AlterTable
ALTER TABLE "public"."SalaryMonth" ADD COLUMN     "type" "public"."SalaryMonthType";
