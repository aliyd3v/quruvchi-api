-- AlterTable
ALTER TABLE "public"."DebtHistoryItem" ADD COLUMN     "paid_amount" BIGINT DEFAULT 0,
ADD COLUMN     "remaining_amount" BIGINT DEFAULT 0;
