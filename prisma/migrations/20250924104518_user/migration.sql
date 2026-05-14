-- AlterTable
ALTER TABLE "public"."AuthAttempts" ADD COLUMN     "blocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "period" INTEGER NOT NULL DEFAULT 1;
