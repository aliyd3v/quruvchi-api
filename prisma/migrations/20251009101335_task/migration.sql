/*
  Warnings:

  - You are about to drop the column `lotId` on the `Attachment` table. All the data in the column will be lost.
  - You are about to drop the column `objectId` on the `Attachment` table. All the data in the column will be lost.
  - You are about to drop the column `transactionId` on the `Attachment` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Attachment" DROP CONSTRAINT "Attachment_lotId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Attachment" DROP CONSTRAINT "Attachment_objectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Attachment" DROP CONSTRAINT "Attachment_transactionId_fkey";

-- AlterTable
ALTER TABLE "public"."Attachment" DROP COLUMN "lotId",
DROP COLUMN "objectId",
DROP COLUMN "transactionId",
ADD COLUMN     "lot_id" INTEGER,
ADD COLUMN     "object_id" INTEGER,
ADD COLUMN     "task_id" INTEGER,
ADD COLUMN     "transaction_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "public"."Object"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "public"."Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
