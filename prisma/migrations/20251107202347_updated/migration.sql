/*
  Warnings:

  - You are about to drop the `AuditLog` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
ALTER TYPE "public"."Unit" ADD VALUE 'UZS';

-- DropForeignKey
ALTER TABLE "public"."AuditLog" DROP CONSTRAINT "AuditLog_actor_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."TaskAssignment" DROP CONSTRAINT "TaskAssignment_task_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."TaskComment" DROP CONSTRAINT "TaskComment_task_id_fkey";

-- AlterTable
ALTER TABLE "public"."Attachment" ADD COLUMN     "deleted_by_id" INTEGER,
ADD COLUMN     "taskHistoryId" INTEGER,
ADD COLUMN     "userId" INTEGER;

-- DropTable
DROP TABLE "public"."AuditLog";

-- CreateTable
CREATE TABLE "public"."TaskHistory" (
    "id" SERIAL NOT NULL,
    "quatnity_of_complated" INTEGER,
    "description" TEXT,
    "date" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "task_id" INTEGER,
    "created_by_id" INTEGER,
    "deleted_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "TaskHistory_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_taskHistoryId_fkey" FOREIGN KEY ("taskHistoryId") REFERENCES "public"."TaskHistory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskHistory" ADD CONSTRAINT "TaskHistory_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskHistory" ADD CONSTRAINT "TaskHistory_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskHistory" ADD CONSTRAINT "TaskHistory_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskAssignment" ADD CONSTRAINT "TaskAssignment_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskComment" ADD CONSTRAINT "TaskComment_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
