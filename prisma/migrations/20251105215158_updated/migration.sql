-- DropForeignKey
ALTER TABLE "public"."SalaryPayment" DROP CONSTRAINT "SalaryPayment_transaction_id_fkey";

-- AddForeignKey
ALTER TABLE "public"."SalaryPayment" ADD CONSTRAINT "SalaryPayment_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
