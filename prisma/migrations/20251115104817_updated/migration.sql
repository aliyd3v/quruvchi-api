-- CreateTable
CREATE TABLE "public"."DebtHistoryItem" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "parameter" TEXT,
    "quantity" INTEGER,
    "price_per_unit" BIGINT,
    "totalPrice" BIGINT,
    "recipient" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "unit" "public"."Unit",
    "debt_history_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "DebtHistoryItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."DebtHistoryItem" ADD CONSTRAINT "DebtHistoryItem_debt_history_id_fkey" FOREIGN KEY ("debt_history_id") REFERENCES "public"."DebtHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
