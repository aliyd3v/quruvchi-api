-- CreateEnum
CREATE TYPE "public"."EntryColor" AS ENUM ('WHITE', 'GREEN', 'ORANGE', 'YELLOW', 'RED');

-- CreateEnum
CREATE TYPE "public"."InvoiceStatus" AS ENUM ('NO_INVOICE', 'NOT_CLOSED', 'CLOSED', 'LATE');

-- AlterTable
ALTER TABLE "public"."Attachment" ADD COLUMN     "bank_acceptance_entry_id" INTEGER,
ADD COLUMN     "invoice_entry_id" INTEGER;

-- CreateTable
CREATE TABLE "public"."Entry" (
    "id" SERIAL NOT NULL,
    "contract_number" TEXT,
    "inn_stir" TEXT,
    "date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lot" TEXT,
    "purpose" TEXT,
    "amount" BIGINT NOT NULL,
    "contract_amount" BIGINT,
    "poa_number" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "color" "public"."EntryColor" NOT NULL,
    "has_invoice" BOOLEAN NOT NULL,
    "invoiceStatus" "public"."InvoiceStatus",
    "description" TEXT,
    "organization_id" INTEGER,
    "created_by_id" INTEGER,
    "deleted_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Entry_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_invoice_entry_id_fkey" FOREIGN KEY ("invoice_entry_id") REFERENCES "public"."Entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_bank_acceptance_entry_id_fkey" FOREIGN KEY ("bank_acceptance_entry_id") REFERENCES "public"."Entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Entry" ADD CONSTRAINT "Entry_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Entry" ADD CONSTRAINT "Entry_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Entry" ADD CONSTRAINT "Entry_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
