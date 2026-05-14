/*
  Warnings:

  - You are about to drop the column `createdById` on the `Attachment` table. All the data in the column will be lost.
  - You are about to drop the column `actorId` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `entityId` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `contractNo` on the `Contract` table. All the data in the column will be lost.
  - You are about to drop the column `endDate` on the `Contract` table. All the data in the column will be lost.
  - You are about to drop the column `objectId` on the `Contract` table. All the data in the column will be lost.
  - You are about to drop the column `startDate` on the `Contract` table. All the data in the column will be lost.
  - You are about to drop the column `initialAmount` on the `Fund` table. All the data in the column will be lost.
  - You are about to drop the column `objectId` on the `Fund` table. All the data in the column will be lost.
  - You are about to drop the column `prorabId` on the `Fund` table. All the data in the column will be lost.
  - You are about to drop the column `superadminId` on the `Fund` table. All the data in the column will be lost.
  - You are about to drop the column `assignedToId` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `contractId` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `endDate` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `objectId` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `startDate` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `assignedToId` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `createdById` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `lotId` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `createdById` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `fundId` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `lotId` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `ownerId` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `recipientId` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `recipientName` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `referenceNo` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `relatedToId` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the column `twoFASecret` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `WorkVolume` table. All the data in the column will be lost.
  - You are about to drop the column `objectId` on the `WorkVolume` table. All the data in the column will be lost.
  - You are about to drop the column `totalAmount` on the `WorkVolume` table. All the data in the column will be lost.
  - You are about to drop the column `unitPrice` on the `WorkVolume` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `WorkVolume` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[contract_no]` on the table `Contract` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `initial_amount` to the `Fund` table without a default value. This is not possible if the table is not empty.
  - Added the required column `object_id` to the `Fund` table without a default value. This is not possible if the table is not empty.
  - Added the required column `prorab_id` to the `Fund` table without a default value. This is not possible if the table is not empty.
  - Added the required column `superadmin_id` to the `Fund` table without a default value. This is not possible if the table is not empty.
  - Added the required column `created_by_id` to the `Transaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fund_id` to the `Transaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `total_amount` to the `WorkVolume` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unit_price` to the `WorkVolume` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `WorkVolume` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Attachment" DROP CONSTRAINT "Attachment_createdById_fkey";

-- DropForeignKey
ALTER TABLE "public"."AuditLog" DROP CONSTRAINT "AuditLog_actorId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Contract" DROP CONSTRAINT "Contract_objectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Fund" DROP CONSTRAINT "Fund_objectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Fund" DROP CONSTRAINT "Fund_prorabId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Fund" DROP CONSTRAINT "Fund_superadminId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Lot" DROP CONSTRAINT "Lot_assignedToId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Lot" DROP CONSTRAINT "Lot_contractId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Lot" DROP CONSTRAINT "Lot_objectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Task" DROP CONSTRAINT "Task_assignedToId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Task" DROP CONSTRAINT "Task_createdById_fkey";

-- DropForeignKey
ALTER TABLE "public"."Task" DROP CONSTRAINT "Task_lotId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Transaction" DROP CONSTRAINT "Transaction_createdById_fkey";

-- DropForeignKey
ALTER TABLE "public"."Transaction" DROP CONSTRAINT "Transaction_fundId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Transaction" DROP CONSTRAINT "Transaction_lotId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Transaction" DROP CONSTRAINT "Transaction_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Transaction" DROP CONSTRAINT "Transaction_recipientId_fkey";

-- DropForeignKey
ALTER TABLE "public"."WorkVolume" DROP CONSTRAINT "WorkVolume_objectId_fkey";

-- DropIndex
DROP INDEX "public"."Contract_contractNo_key";

-- AlterTable
ALTER TABLE "public"."Attachment" DROP COLUMN "createdById",
ADD COLUMN     "created_by_id" INTEGER;

-- AlterTable
ALTER TABLE "public"."AuditLog" DROP COLUMN "actorId",
DROP COLUMN "entityId",
ADD COLUMN     "actor_id" INTEGER,
ADD COLUMN     "entity_id" TEXT;

-- AlterTable
ALTER TABLE "public"."Avatar" ALTER COLUMN "size" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."Contract" DROP COLUMN "contractNo",
DROP COLUMN "endDate",
DROP COLUMN "objectId",
DROP COLUMN "startDate",
ADD COLUMN     "contract_no" TEXT,
ADD COLUMN     "end_date" TIMESTAMP(3),
ADD COLUMN     "object_id" INTEGER,
ADD COLUMN     "start_date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."Fund" DROP COLUMN "initialAmount",
DROP COLUMN "objectId",
DROP COLUMN "prorabId",
DROP COLUMN "superadminId",
ADD COLUMN     "initial_amount" BIGINT NOT NULL,
ADD COLUMN     "object_id" INTEGER NOT NULL,
ADD COLUMN     "prorab_id" INTEGER NOT NULL,
ADD COLUMN     "superadmin_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "public"."Lot" DROP COLUMN "assignedToId",
DROP COLUMN "contractId",
DROP COLUMN "endDate",
DROP COLUMN "objectId",
DROP COLUMN "startDate",
ADD COLUMN     "assigned_to_id" INTEGER,
ADD COLUMN     "contract_id" INTEGER,
ADD COLUMN     "end_date" TIMESTAMP(3),
ADD COLUMN     "object_id" INTEGER,
ADD COLUMN     "start_date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."Task" DROP COLUMN "assignedToId",
DROP COLUMN "createdById",
DROP COLUMN "lotId",
ADD COLUMN     "assigned_to_id" INTEGER,
ADD COLUMN     "created_by_id" INTEGER,
ADD COLUMN     "lot_id" INTEGER;

-- AlterTable
ALTER TABLE "public"."TempToken" ALTER COLUMN "type" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."Transaction" DROP COLUMN "createdById",
DROP COLUMN "fundId",
DROP COLUMN "lotId",
DROP COLUMN "ownerId",
DROP COLUMN "recipientId",
DROP COLUMN "recipientName",
DROP COLUMN "referenceNo",
DROP COLUMN "relatedToId",
ADD COLUMN     "created_by_id" INTEGER NOT NULL,
ADD COLUMN     "fund_id" INTEGER NOT NULL,
ADD COLUMN     "lot_id" INTEGER,
ADD COLUMN     "owner_id" INTEGER,
ADD COLUMN     "recipient_id" INTEGER,
ADD COLUMN     "recipient_name" TEXT,
ADD COLUMN     "reference_no" TEXT,
ADD COLUMN     "related_to_id" INTEGER;

-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "twoFASecret",
ADD COLUMN     "two_fa_secret" TEXT;

-- AlterTable
ALTER TABLE "public"."WorkVolume" DROP COLUMN "createdAt",
DROP COLUMN "objectId",
DROP COLUMN "totalAmount",
DROP COLUMN "unitPrice",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "objetc_id" INTEGER,
ADD COLUMN     "total_amount" BIGINT NOT NULL,
ADD COLUMN     "unit_price" BIGINT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Contract_contract_no_key" ON "public"."Contract"("contract_no");

-- AddForeignKey
ALTER TABLE "public"."WorkVolume" ADD CONSTRAINT "WorkVolume_objetc_id_fkey" FOREIGN KEY ("objetc_id") REFERENCES "public"."Object"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Contract" ADD CONSTRAINT "Contract_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "public"."Object"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lot" ADD CONSTRAINT "Lot_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "public"."Object"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lot" ADD CONSTRAINT "Lot_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lot" ADD CONSTRAINT "Lot_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Fund" ADD CONSTRAINT "Fund_prorab_id_fkey" FOREIGN KEY ("prorab_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Fund" ADD CONSTRAINT "Fund_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "public"."Object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Fund" ADD CONSTRAINT "Fund_superadmin_id_fkey" FOREIGN KEY ("superadmin_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "public"."Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "public"."Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "public"."Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
