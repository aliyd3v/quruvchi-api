-- AlterTable
ALTER TABLE "public"."Task" ADD COLUMN     "progress" INTEGER,
ALTER COLUMN "priority" DROP NOT NULL,
ALTER COLUMN "priority" DROP DEFAULT;
