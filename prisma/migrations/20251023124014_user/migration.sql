-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "currentBaseSalary" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "last_paid_date" TIMESTAMPTZ(6),
ADD COLUMN     "salary_month_end_date" TIMESTAMPTZ(6);
