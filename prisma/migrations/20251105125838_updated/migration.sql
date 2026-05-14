-- DropForeignKey
ALTER TABLE "public"."SalaryMonth" DROP CONSTRAINT "SalaryMonth_created_by_fkey";

-- AlterTable
ALTER TABLE "public"."SalaryMonth" ADD COLUMN     "negotiation" TEXT,
ADD COLUMN     "object_id" INTEGER,
ALTER COLUMN "created_by" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."SalaryMonth" ADD CONSTRAINT "SalaryMonth_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "public"."Object"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalaryMonth" ADD CONSTRAINT "SalaryMonth_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
