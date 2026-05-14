-- CreateTable
CREATE TABLE "public"."DebtAppliedPayment" (
    "id" SERIAL NOT NULL,
    "amount_applied" BIGINT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "debt_history_item_id" INTEGER,
    "debt_history_id" INTEGER,

    CONSTRAINT "DebtAppliedPayment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."DebtAppliedPayment" ADD CONSTRAINT "DebtAppliedPayment_debt_history_item_id_fkey" FOREIGN KEY ("debt_history_item_id") REFERENCES "public"."DebtHistoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DebtAppliedPayment" ADD CONSTRAINT "DebtAppliedPayment_debt_history_id_fkey" FOREIGN KEY ("debt_history_id") REFERENCES "public"."DebtHistory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
