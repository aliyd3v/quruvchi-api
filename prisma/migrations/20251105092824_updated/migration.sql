-- AlterTable
ALTER TABLE "public"."SalaryMonth" ALTER COLUMN "year" DROP NOT NULL,
ALTER COLUMN "start_date" DROP NOT NULL,
ALTER COLUMN "end_date" DROP NOT NULL;
