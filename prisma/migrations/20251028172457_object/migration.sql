-- AlterTable
ALTER TABLE "public"."Fund" ALTER COLUMN "initial_amount" DROP NOT NULL,
ALTER COLUMN "initial_amount" SET DEFAULT 0;
