-- AlterTable
ALTER TABLE "public"."FundTransfer" ADD COLUMN     "sender_user_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."FundTransfer" ADD CONSTRAINT "FundTransfer_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
