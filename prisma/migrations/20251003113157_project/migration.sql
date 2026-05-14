/*
  Warnings:

  - You are about to drop the column `projectId` on the `Attachment` table. All the data in the column will be lost.
  - You are about to drop the column `projectId` on the `Contract` table. All the data in the column will be lost.
  - You are about to drop the column `projectId` on the `Fund` table. All the data in the column will be lost.
  - You are about to drop the column `projectId` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `projectId` on the `Object` table. All the data in the column will be lost.
  - You are about to drop the `Project` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `objectId` to the `Contract` table without a default value. This is not possible if the table is not empty.
  - Added the required column `objectId` to the `Fund` table without a default value. This is not possible if the table is not empty.
  - Made the column `objectId` on table `Lot` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."Attachment" DROP CONSTRAINT "Attachment_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Contract" DROP CONSTRAINT "Contract_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Fund" DROP CONSTRAINT "Fund_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Lot" DROP CONSTRAINT "Lot_objectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Lot" DROP CONSTRAINT "Lot_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Object" DROP CONSTRAINT "Object_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Project" DROP CONSTRAINT "Project_managerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Project" DROP CONSTRAINT "Project_ownerId_fkey";

-- AlterTable
ALTER TABLE "public"."Attachment" DROP COLUMN "projectId";

-- AlterTable
ALTER TABLE "public"."Contract" DROP COLUMN "projectId",
ADD COLUMN     "objectId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "public"."Fund" DROP COLUMN "projectId",
ADD COLUMN     "objectId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "public"."Lot" DROP COLUMN "projectId",
ALTER COLUMN "objectId" SET NOT NULL;

-- AlterTable
ALTER TABLE "public"."Object" DROP COLUMN "projectId";

-- DropTable
DROP TABLE "public"."Project";

-- DropEnum
DROP TYPE "public"."ProjectStatus";

-- DropEnum
DROP TYPE "public"."ProjectType";

-- AddForeignKey
ALTER TABLE "public"."Contract" ADD CONSTRAINT "Contract_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "public"."Object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lot" ADD CONSTRAINT "Lot_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "public"."Object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Fund" ADD CONSTRAINT "Fund_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "public"."Object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
