/*
  Warnings:

  - The values [PLANNED,IN_PROGRESS,COMPLETED,PAUSED,CANCELLED] on the enum `LotStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."LotStatus_new" AS ENUM ('OPEN', 'LATE', 'IN_PROCESS', 'ENDED', 'SUCCESS');
ALTER TABLE "public"."Lot" ALTER COLUMN "status" TYPE "public"."LotStatus_new" USING ("status"::text::"public"."LotStatus_new");
ALTER TYPE "public"."LotStatus" RENAME TO "LotStatus_old";
ALTER TYPE "public"."LotStatus_new" RENAME TO "LotStatus";
DROP TYPE "public"."LotStatus_old";
COMMIT;
