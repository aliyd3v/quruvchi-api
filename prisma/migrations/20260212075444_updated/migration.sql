-- AlterTable
ALTER TABLE "public"."Transaction" ADD COLUMN     "executed_by_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_executed_by_id_fkey" FOREIGN KEY ("executed_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
