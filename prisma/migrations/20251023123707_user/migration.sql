-- AlterTable
ALTER TABLE "public"."Contract" ALTER COLUMN "end_date" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "start_date" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "public"."Lot" ALTER COLUMN "end_date" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "start_date" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "public"."ProductName" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "public"."ResetAuthAttempts" ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "public"."SalaryMonth" ALTER COLUMN "start_date" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "end_date" SET DATA TYPE TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "public"."TempToken" ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMPTZ(6);
