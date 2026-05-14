-- CreateTable
CREATE TABLE "public"."FundTransfer" (
    "id" SERIAL NOT NULL,
    "from_fund_id" INTEGER,
    "to_fund_id" INTEGER,
    "from_object_id" INTEGER,
    "to_object_id" INTEGER,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdById" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "FundTransfer_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."FundTransfer" ADD CONSTRAINT "FundTransfer_from_fund_id_fkey" FOREIGN KEY ("from_fund_id") REFERENCES "public"."Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FundTransfer" ADD CONSTRAINT "FundTransfer_to_fund_id_fkey" FOREIGN KEY ("to_fund_id") REFERENCES "public"."Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FundTransfer" ADD CONSTRAINT "FundTransfer_from_object_id_fkey" FOREIGN KEY ("from_object_id") REFERENCES "public"."Object"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FundTransfer" ADD CONSTRAINT "FundTransfer_to_object_id_fkey" FOREIGN KEY ("to_object_id") REFERENCES "public"."Object"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FundTransfer" ADD CONSTRAINT "FundTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
