-- AlterTable
ALTER TABLE "public"."Project" ADD COLUMN     "service_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."Services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
