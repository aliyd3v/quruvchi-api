/*
  Warnings:

  - You are about to drop the column `created_at` on the `Location` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Location` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `Location` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Location" DROP COLUMN "created_at",
DROP COLUMN "name",
DROP COLUMN "updated_at";
