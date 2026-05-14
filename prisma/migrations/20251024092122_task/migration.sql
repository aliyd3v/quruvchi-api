-- AlterTable
ALTER TABLE "public"."Task" ADD COLUMN     "complated_by_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_complated_by_id_fkey" FOREIGN KEY ("complated_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
