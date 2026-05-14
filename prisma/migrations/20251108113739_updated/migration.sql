/*
  Warnings:

  - The values [INSTALLATION] on the enum `WorkType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."WorkType_new" AS ENUM ('CONSTRUCTION', 'TRADE', 'FURNITURE', 'SEWING', 'SMETA', 'OTHER');
ALTER TABLE "public"."Object" ALTER COLUMN "work_type" TYPE "public"."WorkType_new" USING ("work_type"::text::"public"."WorkType_new");
ALTER TYPE "public"."WorkType" RENAME TO "WorkType_old";
ALTER TYPE "public"."WorkType_new" RENAME TO "WorkType";
DROP TYPE "public"."WorkType_old";
COMMIT;

-- AlterTable
ALTER TABLE "public"."Object" ALTER COLUMN "work_type" SET DEFAULT 'OTHER';
