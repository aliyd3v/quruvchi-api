/*
  Warnings:

  - The values [MF] on the enum `Unit` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."Unit_new" AS ENUM ('M', 'M2', 'M3', 'TON', 'KG', 'L', 'PCS', 'H', 'DAY', 'SET', 'UZS');
ALTER TABLE "public"."WorkVolume" ALTER COLUMN "unit" TYPE "public"."Unit_new" USING ("unit"::text::"public"."Unit_new");
ALTER TABLE "public"."AnswerToWorkVolume" ALTER COLUMN "unit" TYPE "public"."Unit_new" USING ("unit"::text::"public"."Unit_new");
ALTER TABLE "public"."TransactionItem" ALTER COLUMN "unit" TYPE "public"."Unit_new" USING ("unit"::text::"public"."Unit_new");
ALTER TABLE "public"."Task" ALTER COLUMN "unit" TYPE "public"."Unit_new" USING ("unit"::text::"public"."Unit_new");
ALTER TYPE "public"."Unit" RENAME TO "Unit_old";
ALTER TYPE "public"."Unit_new" RENAME TO "Unit";
DROP TYPE "public"."Unit_old";
COMMIT;
