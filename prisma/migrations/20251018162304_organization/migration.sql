-- CreateEnum
CREATE TYPE "public"."OrganizationStatus" AS ENUM ('ACTIVE', 'NOT_ACTIVE');

-- DropForeignKey
ALTER TABLE "public"."Fund" DROP CONSTRAINT "Fund_object_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Fund" DROP CONSTRAINT "Fund_prorab_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Fund" DROP CONSTRAINT "Fund_superadmin_id_fkey";

-- AlterTable
ALTER TABLE "public"."Fund" ALTER COLUMN "object_id" DROP NOT NULL,
ALTER COLUMN "prorab_id" DROP NOT NULL,
ALTER COLUMN "superadmin_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."Organization" ADD COLUMN     "status" "public"."OrganizationStatus" NOT NULL DEFAULT 'NOT_ACTIVE';

-- AddForeignKey
ALTER TABLE "public"."Fund" ADD CONSTRAINT "Fund_prorab_id_fkey" FOREIGN KEY ("prorab_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Fund" ADD CONSTRAINT "Fund_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "public"."Object"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Fund" ADD CONSTRAINT "Fund_superadmin_id_fkey" FOREIGN KEY ("superadmin_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
