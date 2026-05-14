/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Attachment` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Contract` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Contract` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Fund` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Fund` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Lot` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Object` table. All the data in the column will be lost.
  - You are about to drop the column `endDate` on the `Object` table. All the data in the column will be lost.
  - You are about to drop the column `startDate` on the `Object` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Object` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Transaction` table. All the data in the column will be lost.
  - Added the required column `updated_at` to the `Attachment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Contract` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Fund` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Lot` table without a default value. This is not possible if the table is not empty.
  - Added the required column `description` to the `Object` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Object` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Task` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Attachment" DROP COLUMN "createdAt",
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL;

-- AlterTable
ALTER TABLE "public"."AuditLog" DROP COLUMN "createdAt",
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."Contract" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL;

-- AlterTable
ALTER TABLE "public"."Fund" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL;

-- AlterTable
ALTER TABLE "public"."Lot" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL;

-- AlterTable
ALTER TABLE "public"."Object" DROP COLUMN "createdAt",
DROP COLUMN "endDate",
DROP COLUMN "startDate",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL;

-- AlterTable
ALTER TABLE "public"."Task" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL;

-- AlterTable
ALTER TABLE "public"."Transaction" DROP COLUMN "createdAt",
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
