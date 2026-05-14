-- AlterTable
ALTER TABLE "public"."Task" ADD COLUMN     "client_id" INTEGER,
ADD COLUMN     "contract_date" TIMESTAMPTZ(6),
ADD COLUMN     "contract_number" TEXT,
ADD COLUMN     "delivery_address" TEXT,
ADD COLUMN     "organization_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
