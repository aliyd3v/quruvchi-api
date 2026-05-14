/*
  Warnings:

  - You are about to drop the `_LotToUser` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Attachment" DROP CONSTRAINT "Attachment_lotTaskComplatedId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Attachment" DROP CONSTRAINT "Attachment_lotTaskId_fkey";

-- DropForeignKey
ALTER TABLE "public"."_LotToUser" DROP CONSTRAINT "_LotToUser_A_fkey";

-- DropForeignKey
ALTER TABLE "public"."_LotToUser" DROP CONSTRAINT "_LotToUser_B_fkey";

-- AlterTable
ALTER TABLE "public"."Attachment" ADD COLUMN     "lot_id" INTEGER;

-- AlterTable
ALTER TABLE "public"."Lot" ADD COLUMN     "created_by_id" INTEGER,
ADD COLUMN     "deleted_by_id" INTEGER;

-- DropTable
DROP TABLE "public"."_LotToUser";

-- CreateTable
CREATE TABLE "public"."_lot_assigneds" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_lot_assigneds_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_lot_assigneds_B_index" ON "public"."_lot_assigneds"("B");

-- AddForeignKey
ALTER TABLE "public"."Lot" ADD CONSTRAINT "Lot_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lot" ADD CONSTRAINT "Lot_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "public"."Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_lotTaskId_fkey" FOREIGN KEY ("lotTaskId") REFERENCES "public"."LotTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_lotTaskComplatedId_fkey" FOREIGN KEY ("lotTaskComplatedId") REFERENCES "public"."LotTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_lot_assigneds" ADD CONSTRAINT "_lot_assigneds_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_lot_assigneds" ADD CONSTRAINT "_lot_assigneds_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
