/*
  Warnings:

  - You are about to drop the column `lot_id` on the `Attachment` table. All the data in the column will be lost.
  - You are about to drop the column `from_fund_id` on the `FundTransfer` table. All the data in the column will be lost.
  - You are about to drop the column `to_fund_id` on the `FundTransfer` table. All the data in the column will be lost.
  - You are about to alter the column `amount` on the `FundTransfer` table. The data in that column could be lost. The data in that column will be cast from `Decimal(12,2)` to `BigInt`.
  - You are about to drop the column `lot_id` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `fund_id` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `lot_id` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `owner_id` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `recipient_id` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `recipient_name` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `reference_no` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `related_to_id` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `work_volume_id` on the `Transaction` table. All the data in the column will be lost.
  - Added the required column `created_by_id` to the `Object` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Attachment" DROP CONSTRAINT "Attachment_lot_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."FundTransfer" DROP CONSTRAINT "FundTransfer_from_fund_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."FundTransfer" DROP CONSTRAINT "FundTransfer_to_fund_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Task" DROP CONSTRAINT "Task_lot_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Transaction" DROP CONSTRAINT "Transaction_fund_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Transaction" DROP CONSTRAINT "Transaction_lot_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Transaction" DROP CONSTRAINT "Transaction_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Transaction" DROP CONSTRAINT "Transaction_recipient_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Transaction" DROP CONSTRAINT "Transaction_work_volume_id_fkey";

-- DropIndex
DROP INDEX "public"."idx_txn_fund_date";

-- DropIndex
DROP INDEX "public"."idx_txn_workvolume";

-- AlterTable
ALTER TABLE "public"."Attachment" DROP COLUMN "lot_id";

-- AlterTable
ALTER TABLE "public"."FundTransfer" DROP COLUMN "from_fund_id",
DROP COLUMN "to_fund_id",
ADD COLUMN     "deleted_by_id" INTEGER,
ADD COLUMN     "recipient_user_id" INTEGER,
ALTER COLUMN "amount" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "public"."Object" ADD COLUMN     "created_by_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "public"."Task" DROP COLUMN "lot_id";

-- AlterTable
ALTER TABLE "public"."Transaction" DROP COLUMN "fund_id",
DROP COLUMN "lot_id",
DROP COLUMN "owner_id",
DROP COLUMN "recipient_id",
DROP COLUMN "recipient_name",
DROP COLUMN "reference_no",
DROP COLUMN "related_to_id",
DROP COLUMN "work_volume_id",
ADD COLUMN     "object_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."Object" ADD CONSTRAINT "Object_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FundTransfer" ADD CONSTRAINT "FundTransfer_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FundTransfer" ADD CONSTRAINT "FundTransfer_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "public"."Object"("id") ON DELETE SET NULL ON UPDATE CASCADE;
