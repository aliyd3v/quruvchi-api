-- DropForeignKey
ALTER TABLE "public"."SalaryAppliedPayment" DROP CONSTRAINT "SalaryAppliedPayment_salary_month_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."SalaryAppliedPayment" DROP CONSTRAINT "SalaryAppliedPayment_salary_payment_id_fkey";

-- AddForeignKey
ALTER TABLE "public"."SalaryAppliedPayment" ADD CONSTRAINT "SalaryAppliedPayment_salary_month_id_fkey" FOREIGN KEY ("salary_month_id") REFERENCES "public"."SalaryMonth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalaryAppliedPayment" ADD CONSTRAINT "SalaryAppliedPayment_salary_payment_id_fkey" FOREIGN KEY ("salary_payment_id") REFERENCES "public"."SalaryPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
