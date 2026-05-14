-- DropForeignKey
ALTER TABLE "public"."SalaryMonth" DROP CONSTRAINT "SalaryMonth_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."SalaryPayment" DROP CONSTRAINT "SalaryPayment_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."SalaryPayment" DROP CONSTRAINT "SalaryPayment_transaction_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Transaction" DROP CONSTRAINT "Transaction_fund_id_fkey";

-- AlterTable
ALTER TABLE "public"."SalaryMonth" ALTER COLUMN "owner_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."SalaryPayment" ALTER COLUMN "owner_id" DROP NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE BIGINT,
ALTER COLUMN "remaining" SET DATA TYPE BIGINT,
ALTER COLUMN "transaction_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."Transaction" ALTER COLUMN "fund_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "public"."Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalaryMonth" ADD CONSTRAINT "SalaryMonth_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalaryPayment" ADD CONSTRAINT "SalaryPayment_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalaryPayment" ADD CONSTRAINT "SalaryPayment_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
