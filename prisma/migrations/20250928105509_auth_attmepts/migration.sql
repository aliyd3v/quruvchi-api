/*
  Warnings:

  - You are about to drop the column `createdAt` on the `ConstructionObject` table. All the data in the column will be lost.
  - You are about to drop the column `projectId` on the `ConstructionObject` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `ConstructionObject` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Expense` table. All the data in the column will be lost.
  - You are about to drop the column `materialId` on the `Expense` table. All the data in the column will be lost.
  - You are about to drop the column `projectId` on the `Expense` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Expense` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Material` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Material` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `assignedTo` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `objectId` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `projectId` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `chatId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `AuthAttempts` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `project_id` to the `ConstructionObject` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `ConstructionObject` table without a default value. This is not possible if the table is not empty.
  - Added the required column `project_id` to the `Expense` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Expense` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Material` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `project_id` to the `Task` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Task` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."AuthAttempts" DROP CONSTRAINT "AuthAttempts_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ConstructionObject" DROP CONSTRAINT "ConstructionObject_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Expense" DROP CONSTRAINT "Expense_materialId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Expense" DROP CONSTRAINT "Expense_projectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Task" DROP CONSTRAINT "Task_assignedTo_fkey";

-- DropForeignKey
ALTER TABLE "public"."Task" DROP CONSTRAINT "Task_objectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Task" DROP CONSTRAINT "Task_projectId_fkey";

-- AlterTable
ALTER TABLE "public"."ConstructionObject" DROP COLUMN "createdAt",
DROP COLUMN "projectId",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "project_id" INTEGER NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL;

-- AlterTable
ALTER TABLE "public"."Expense" DROP COLUMN "createdAt",
DROP COLUMN "materialId",
DROP COLUMN "projectId",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "material_id" INTEGER,
ADD COLUMN     "project_id" INTEGER NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL;

-- AlterTable
ALTER TABLE "public"."Material" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL;

-- AlterTable
ALTER TABLE "public"."Project" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL;

-- AlterTable
ALTER TABLE "public"."Task" DROP COLUMN "assignedTo",
DROP COLUMN "createdAt",
DROP COLUMN "objectId",
DROP COLUMN "projectId",
DROP COLUMN "updatedAt",
ADD COLUMN     "assigned_to" INTEGER,
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "object_id" INTEGER,
ADD COLUMN     "project_id" INTEGER NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL;

-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "chatId",
DROP COLUMN "createdAt",
DROP COLUMN "isActive",
DROP COLUMN "updatedAt",
ADD COLUMN     "blocked_until" TIMESTAMPTZ(6),
ADD COLUMN     "chat_id" TEXT,
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "is_2fa_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "last_seans" TIMESTAMPTZ(6),
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL;

-- DropTable
DROP TABLE "public"."AuthAttempts";

-- CreateTable
CREATE TABLE "public"."ResetAuthAttempts" (
    "id" SERIAL NOT NULL,
    "attempt_id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "ip" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" VARCHAR(255) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "used_for_reset" BOOLEAN NOT NULL DEFAULT false,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "period" INTEGER NOT NULL DEFAULT 1,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ResetAuthAttempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResetAuthAttempts_attempt_id_key" ON "public"."ResetAuthAttempts"("attempt_id");

-- AddForeignKey
ALTER TABLE "public"."ResetAuthAttempts" ADD CONSTRAINT "ResetAuthAttempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConstructionObject" ADD CONSTRAINT "ConstructionObject_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "public"."ConstructionObject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Expense" ADD CONSTRAINT "Expense_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Expense" ADD CONSTRAINT "Expense_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
