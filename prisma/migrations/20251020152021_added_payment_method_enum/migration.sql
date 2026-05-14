/*
  Warnings:

  - Added the required column `payment_method` to the `SalaryPayment` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER');

-- AlterTable
ALTER TABLE "public"."SalaryMonth" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "public"."SalaryPayment" ADD COLUMN     "payment_method" "public"."PaymentMethod" NOT NULL;
