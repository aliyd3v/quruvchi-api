-- AlterTable
ALTER TABLE "public"."Fund" ADD COLUMN     "total_expense" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "total_income" BIGINT NOT NULL DEFAULT 0;
