-- AlterTable
ALTER TABLE "public"."Inventory" ADD COLUMN     "total_input" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "total_output" INTEGER NOT NULL DEFAULT 0;
