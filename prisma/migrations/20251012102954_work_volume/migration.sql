/*
  Warnings:

  - You are about to drop the column `fundId` on the `WorkVolume` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."WorkVolume" DROP CONSTRAINT "WorkVolume_fundId_fkey";

-- AlterTable
ALTER TABLE "public"."Fund" ADD COLUMN     "work_volume_id" INTEGER;

-- AlterTable
ALTER TABLE "public"."Transaction" ADD COLUMN     "work_volume_id" INTEGER;

-- AlterTable
ALTER TABLE "public"."WorkVolume" DROP COLUMN "fundId";

-- AddForeignKey
ALTER TABLE "public"."Fund" ADD CONSTRAINT "Fund_work_volume_id_fkey" FOREIGN KEY ("work_volume_id") REFERENCES "public"."WorkVolume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_work_volume_id_fkey" FOREIGN KEY ("work_volume_id") REFERENCES "public"."WorkVolume"("id") ON DELETE SET NULL ON UPDATE CASCADE;
