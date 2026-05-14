-- DropForeignKey
ALTER TABLE "public"."TaskComment" DROP CONSTRAINT "TaskComment_task_id_fkey";

-- AlterTable
ALTER TABLE "public"."TaskComment" ADD COLUMN     "worker_id" INTEGER,
ALTER COLUMN "task_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."TaskComment" ADD CONSTRAINT "TaskComment_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskComment" ADD CONSTRAINT "TaskComment_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
