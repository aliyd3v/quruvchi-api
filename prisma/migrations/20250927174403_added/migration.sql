/*
  Warnings:

  - You are about to drop the column `attempt_count` on the `AuthAttempts` table. All the data in the column will be lost.
  - You are about to drop the column `attempt_id` on the `AuthAttempts` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `AuthAttempts` table. All the data in the column will be lost.
  - You are about to drop the column `expires_at` on the `AuthAttempts` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `AuthAttempts` table. All the data in the column will be lost.
  - You are about to drop the column `used_for_reset` on the `AuthAttempts` table. All the data in the column will be lost.
  - You are about to drop the column `user_agent` on the `AuthAttempts` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `AuthAttempts` table. All the data in the column will be lost.
  - You are about to drop the column `chat_id` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `is_active` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[attemptId]` on the table `AuthAttempts` will be added. If there are existing duplicate values, this will fail.
  - The required column `attemptId` was added to the `AuthAttempts` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `expiresAt` to the `AuthAttempts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `AuthAttempts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userAgent` to the `AuthAttempts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `AuthAttempts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."AuthAttempts" DROP CONSTRAINT "AuthAttempts_user_id_fkey";

-- DropIndex
DROP INDEX "public"."AuthAttempts_attempt_id_key";

-- AlterTable
ALTER TABLE "public"."AuthAttempts" DROP COLUMN "attempt_count",
DROP COLUMN "attempt_id",
DROP COLUMN "created_at",
DROP COLUMN "expires_at",
DROP COLUMN "updated_at",
DROP COLUMN "used_for_reset",
DROP COLUMN "user_agent",
DROP COLUMN "user_id",
ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "attemptId" UUID NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(6) NOT NULL,
ADD COLUMN     "usedForReset" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "userAgent" TEXT NOT NULL,
ADD COLUMN     "userId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "chat_id",
DROP COLUMN "created_at",
DROP COLUMN "is_active",
DROP COLUMN "updated_at",
ADD COLUMN     "chatId" TEXT,
ADD COLUMN     "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(6) NOT NULL;

-- CreateTable
CREATE TABLE "public"."Project" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ConstructionObject" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "projectId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ConstructionObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Task" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "objectId" INTEGER,
    "assignedTo" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Material" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Expense" (
    "id" SERIAL NOT NULL,
    "description" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "projectId" INTEGER NOT NULL,
    "materialId" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthAttempts_attemptId_key" ON "public"."AuthAttempts"("attemptId");

-- AddForeignKey
ALTER TABLE "public"."AuthAttempts" ADD CONSTRAINT "AuthAttempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConstructionObject" ADD CONSTRAINT "ConstructionObject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "public"."ConstructionObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Expense" ADD CONSTRAINT "Expense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Expense" ADD CONSTRAINT "Expense_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "public"."Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
