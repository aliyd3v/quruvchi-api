/*
  Warnings:

  - You are about to drop the `_ObjectToUser` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."_ObjectToUser" DROP CONSTRAINT "_ObjectToUser_A_fkey";

-- DropForeignKey
ALTER TABLE "public"."_ObjectToUser" DROP CONSTRAINT "_ObjectToUser_B_fkey";

-- AlterTable
ALTER TABLE "public"."Object" ADD COLUMN     "deleted_by_id" INTEGER;

-- DropTable
DROP TABLE "public"."_ObjectToUser";

-- CreateTable
CREATE TABLE "public"."Organization" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Debt" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."_assigned_users" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_assigned_users_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_assigned_users_B_index" ON "public"."_assigned_users"("B");

-- AddForeignKey
ALTER TABLE "public"."Object" ADD CONSTRAINT "Object_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_assigned_users" ADD CONSTRAINT "_assigned_users_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Object"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_assigned_users" ADD CONSTRAINT "_assigned_users_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
