-- CreateEnum
CREATE TYPE "public"."SalaryStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'LATE');

-- CreateEnum
CREATE TYPE "public"."PaymentType" AS ENUM ('AVANS', 'PENALTY', 'SALARY');

-- CreateTable
CREATE TABLE "public"."SalaryMonth" (
    "id" SERIAL NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "day" INTEGER,
    "month" INTEGER,
    "year" INTEGER NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "baseSalary" INTEGER NOT NULL,
    "totalPaid" INTEGER NOT NULL DEFAULT 0,
    "total_advance" INTEGER NOT NULL DEFAULT 0,
    "total_penalty" INTEGER NOT NULL DEFAULT 0,
    "carry_over_from" INTEGER NOT NULL DEFAULT 0,
    "carry_over_to_next" INTEGER NOT NULL DEFAULT 0,
    "status" "public"."SalaryStatus" NOT NULL DEFAULT 'UNPAID',
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SalaryMonth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SalaryPayment" (
    "id" SERIAL NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL DEFAULT 0,
    "type" "public"."PaymentType" NOT NULL,
    "description" TEXT,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "transaction_id" INTEGER NOT NULL,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SalaryPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SalaryAppliedPayment" (
    "id" SERIAL NOT NULL,
    "salary_month_id" INTEGER NOT NULL,
    "salary_payment_id" INTEGER NOT NULL,
    "amount_applied" INTEGER NOT NULL,

    CONSTRAINT "SalaryAppliedPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalaryPayment_transaction_id_key" ON "public"."SalaryPayment"("transaction_id");

-- AddForeignKey
ALTER TABLE "public"."SalaryMonth" ADD CONSTRAINT "SalaryMonth_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalaryMonth" ADD CONSTRAINT "SalaryMonth_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalaryPayment" ADD CONSTRAINT "SalaryPayment_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalaryPayment" ADD CONSTRAINT "SalaryPayment_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalaryPayment" ADD CONSTRAINT "SalaryPayment_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalaryAppliedPayment" ADD CONSTRAINT "SalaryAppliedPayment_salary_month_id_fkey" FOREIGN KEY ("salary_month_id") REFERENCES "public"."SalaryMonth"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalaryAppliedPayment" ADD CONSTRAINT "SalaryAppliedPayment_salary_payment_id_fkey" FOREIGN KEY ("salary_payment_id") REFERENCES "public"."SalaryPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
