-- AlterTable
ALTER TABLE "public"."FundTransfer" ADD COLUMN     "from_organization_id" INTEGER,
ADD COLUMN     "to_organization_id" INTEGER;

-- AlterTable
ALTER TABLE "public"."Organization" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "public"."FundTransfer" ADD CONSTRAINT "FundTransfer_to_organization_id_fkey" FOREIGN KEY ("to_organization_id") REFERENCES "public"."Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FundTransfer" ADD CONSTRAINT "FundTransfer_from_organization_id_fkey" FOREIGN KEY ("from_organization_id") REFERENCES "public"."Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
