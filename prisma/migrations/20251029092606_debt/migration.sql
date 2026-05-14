/*
  Warnings:

  - The values [BOROWWED,LEND] on the enum `DebtType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."DebtType_new" AS ENUM ('BORROWED', 'LENT');
ALTER TABLE "public"."Debt" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "public"."Debt" ALTER COLUMN "type" TYPE "public"."DebtType_new" USING ("type"::text::"public"."DebtType_new");
ALTER TYPE "public"."DebtType" RENAME TO "DebtType_old";
ALTER TYPE "public"."DebtType_new" RENAME TO "DebtType";
DROP TYPE "public"."DebtType_old";
ALTER TABLE "public"."Debt" ALTER COLUMN "type" SET DEFAULT 'LENT';
COMMIT;

-- AlterTable
ALTER TABLE "public"."Debt" ALTER COLUMN "type" SET DEFAULT 'LENT';
