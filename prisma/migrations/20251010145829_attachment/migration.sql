-- AlterTable
ALTER TABLE "public"."Attachment" ADD COLUMN     "originalname" TEXT;

-- AlterTable
ALTER TABLE "public"."Transaction" ADD COLUMN     "recipientId" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
