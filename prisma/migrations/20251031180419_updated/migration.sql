-- AlterTable
ALTER TABLE "public"."Organization" ADD COLUMN     "balance" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "total_expense" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "totla_income" BIGINT NOT NULL DEFAULT 0;
