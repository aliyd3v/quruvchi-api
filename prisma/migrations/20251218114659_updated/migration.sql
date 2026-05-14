/*
  Warnings:

  - You are about to drop the column `amount` on the `Debt` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "public"."DebtTransactionType" AS ENUM ('ADDED', 'PAID');

-- CreateEnum
CREATE TYPE "public"."DebtAuditAction" AS ENUM ('DEBT_CREATED', 'DEBT_UPDATED', 'DEBT_DELETED', 'DEBT_RESTORED', 'TRANSACTION_ADDED', 'TRANSACTION_UPDATED', 'TRANSACTION_DELETED', 'ITEM_ADDED', 'ITEM_UPDATED', 'ITEM_DELETED', 'PAYMENT_ADDED', 'PAYMENT_UPDATED', 'PAYMENT_DELETED');

-- AlterTable
ALTER TABLE "public"."AnswerToWorkVolume" ALTER COLUMN "created_by_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."Debt" DROP COLUMN "amount",
ADD COLUMN     "total_amount" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."DebtTransaction" (
    "id" SERIAL NOT NULL,
    "type" "public"."DebtTransactionType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "description" TEXT,
    "debt_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "DebtTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DebtItem" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "parameter" TEXT,
    "quantity" DECIMAL(10,3) NOT NULL,
    "price_per_unit" BIGINT NOT NULL,
    "total_price" BIGINT NOT NULL,
    "paid_amount" BIGINT NOT NULL DEFAULT 0,
    "recipient" TEXT,
    "unit" "public"."Unit",
    "debt_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "DebtItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DebtPayment" (
    "id" SERIAL NOT NULL,
    "amount" BIGINT NOT NULL,
    "description" TEXT,
    "debt_id" INTEGER NOT NULL,
    "item_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "DebtPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DebtAuditLog" (
    "id" SERIAL NOT NULL,
    "action" "public"."DebtAuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER,
    "previous_data" JSONB,
    "new_data" JSONB,
    "performed_by_id" INTEGER,
    "debt_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DebtTransaction_debt_id_idx" ON "public"."DebtTransaction"("debt_id");

-- CreateIndex
CREATE INDEX "DebtTransaction_type_idx" ON "public"."DebtTransaction"("type");

-- CreateIndex
CREATE INDEX "DebtTransaction_is_active_idx" ON "public"."DebtTransaction"("is_active");

-- CreateIndex
CREATE INDEX "DebtItem_debt_id_idx" ON "public"."DebtItem"("debt_id");

-- CreateIndex
CREATE INDEX "DebtItem_is_active_idx" ON "public"."DebtItem"("is_active");

-- CreateIndex
CREATE INDEX "DebtPayment_debt_id_idx" ON "public"."DebtPayment"("debt_id");

-- CreateIndex
CREATE INDEX "DebtPayment_item_id_idx" ON "public"."DebtPayment"("item_id");

-- CreateIndex
CREATE INDEX "DebtPayment_is_active_idx" ON "public"."DebtPayment"("is_active");

-- CreateIndex
CREATE INDEX "DebtAuditLog_debt_id_idx" ON "public"."DebtAuditLog"("debt_id");

-- CreateIndex
CREATE INDEX "DebtAuditLog_action_idx" ON "public"."DebtAuditLog"("action");

-- CreateIndex
CREATE INDEX "DebtAuditLog_created_at_idx" ON "public"."DebtAuditLog"("created_at");

-- CreateIndex
CREATE INDEX "Debt_is_active_idx" ON "public"."Debt"("is_active");

-- CreateIndex
CREATE INDEX "Debt_counterPartyType_idx" ON "public"."Debt"("counterPartyType");

-- AddForeignKey
ALTER TABLE "public"."DebtTransaction" ADD CONSTRAINT "DebtTransaction_debt_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "public"."Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DebtItem" ADD CONSTRAINT "DebtItem_debt_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "public"."Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DebtPayment" ADD CONSTRAINT "DebtPayment_debt_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "public"."Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DebtPayment" ADD CONSTRAINT "DebtPayment_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."DebtItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DebtAuditLog" ADD CONSTRAINT "DebtAuditLog_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DebtAuditLog" ADD CONSTRAINT "DebtAuditLog_debt_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "public"."Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
