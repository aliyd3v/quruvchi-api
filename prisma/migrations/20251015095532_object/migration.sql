/*
  Warnings:

  - The values [DEDUCTION,ADJUSTMENT] on the enum `TransactionType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."TransactionType_new" AS ENUM ('INCOME', 'EXPENSE');
ALTER TABLE "public"."Transaction" ALTER COLUMN "type" TYPE "public"."TransactionType_new" USING ("type"::text::"public"."TransactionType_new");
ALTER TYPE "public"."TransactionType" RENAME TO "TransactionType_old";
ALTER TYPE "public"."TransactionType_new" RENAME TO "TransactionType";
DROP TYPE "public"."TransactionType_old";
COMMIT;

-- AlterTable
ALTER TABLE "public"."Fund" ADD COLUMN     "current_balance" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."WorkVolume" ADD COLUMN     "spent_amount" BIGINT NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "idx_fund_object" ON "public"."Fund"("object_id");

-- CreateIndex
CREATE INDEX "idx_fund_object_prorab" ON "public"."Fund"("object_id", "prorab_id");

-- CreateIndex
CREATE INDEX "idx_txn_fund_date" ON "public"."Transaction"("fund_id", "date");

-- CreateIndex
CREATE INDEX "idx_txn_workvolume" ON "public"."Transaction"("work_volume_id");
