-- AlterTable
ALTER TABLE "public"."SalaryPayment" ALTER COLUMN "payment_method" DROP NOT NULL,
ALTER COLUMN "payment_method" DROP DEFAULT;
