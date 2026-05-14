/*
  Warnings:

  - Added the required column `type` to the `AuthAttempts` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."AuthAttempts" ADD COLUMN     "type" VARCHAR(255) NOT NULL;
