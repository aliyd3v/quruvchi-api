-- AlterTable
ALTER TABLE "public"."Object" ADD COLUMN     "current_balance" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;
