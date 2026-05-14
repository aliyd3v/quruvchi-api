-- AlterTable
ALTER TABLE "public"."Debt" ADD COLUMN     "organization_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."Debt" ADD CONSTRAINT "Debt_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
