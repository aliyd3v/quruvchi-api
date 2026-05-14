-- AlterTable
ALTER TABLE "public"."Debt" ADD COLUMN     "deleted_by_id" INTEGER;

-- AlterTable
ALTER TABLE "public"."Organization" ADD COLUMN     "deleted_by_id" INTEGER;

-- AlterTable
ALTER TABLE "public"."Task" ADD COLUMN     "deleted_by_id" INTEGER;

-- AlterTable
ALTER TABLE "public"."WorkVolume" ADD COLUMN     "deleted_by_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."Organization" ADD CONSTRAINT "Organization_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkVolume" ADD CONSTRAINT "WorkVolume_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Debt" ADD CONSTRAINT "Debt_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
