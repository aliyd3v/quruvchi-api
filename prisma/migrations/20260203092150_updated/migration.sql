-- AlterTable
ALTER TABLE "public"."Transaction" ADD COLUMN     "branch_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
