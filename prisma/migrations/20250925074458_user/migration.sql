-- AlterTable
ALTER TABLE "public"."AuthAttempts" ADD COLUMN     "used_for_reset" BOOLEAN NOT NULL DEFAULT false;
