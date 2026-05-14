/*
  Warnings:

  - You are about to alter the column `code` on the `AuthAttempts` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(6)`.

*/
-- AlterTable
ALTER TABLE "public"."AuthAttempts" ALTER COLUMN "code" SET DATA TYPE VARCHAR(6);
