-- DropForeignKey
ALTER TABLE "public"."TaskAssignment" DROP CONSTRAINT "TaskAssignment_task_id_fkey";

-- AlterTable
ALTER TABLE "public"."TaskAssignment" ALTER COLUMN "task_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."TaskAssignment" ADD CONSTRAINT "TaskAssignment_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
