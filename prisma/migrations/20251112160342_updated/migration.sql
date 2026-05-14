-- CreateTable
CREATE TABLE "public"."TransactionItem" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "parameter" TEXT,
    "quantity" INTEGER,
    "price_per_unit" BIGINT,
    "totalPrice" BIGINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "unit" "public"."Unit",
    "transaction_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "TransactionItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."TransactionItem" ADD CONSTRAINT "TransactionItem_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
