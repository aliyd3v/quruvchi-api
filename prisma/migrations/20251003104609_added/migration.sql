/*
  Warnings:

  - You are about to drop the column `address` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Transaction` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "public"."ObjectStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');

-- DropForeignKey
ALTER TABLE "public"."Transaction" DROP CONSTRAINT "Transaction_userId_fkey";

-- AlterTable
ALTER TABLE "public"."Attachment" ADD COLUMN     "objectId" INTEGER;

-- AlterTable
ALTER TABLE "public"."Lot" ADD COLUMN     "objectId" INTEGER;

-- AlterTable
ALTER TABLE "public"."Project" DROP COLUMN "address";

-- AlterTable
ALTER TABLE "public"."Transaction" DROP COLUMN "userId",
ADD COLUMN     "ownerId" INTEGER;

-- CreateTable
CREATE TABLE "public"."Object" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "status" "public"."ObjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Object_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Object" ADD CONSTRAINT "Object_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lot" ADD CONSTRAINT "Lot_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "public"."Object"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "public"."Object"("id") ON DELETE SET NULL ON UPDATE CASCADE;
