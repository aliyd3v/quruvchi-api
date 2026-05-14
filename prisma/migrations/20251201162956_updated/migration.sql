-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."EntryColor" ADD VALUE 'DARK';
ALTER TYPE "public"."EntryColor" ADD VALUE 'LIGHT';

-- DropForeignKey
ALTER TABLE "public"."Attachment" DROP CONSTRAINT "Attachment_task_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Entry" DROP CONSTRAINT "Entry_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."SalaryPayment" DROP CONSTRAINT "SalaryPayment_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Task" DROP CONSTRAINT "Task_parent_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."TaskAssignment" DROP CONSTRAINT "TaskAssignment_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."TaskComment" DROP CONSTRAINT "TaskComment_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Transaction" DROP CONSTRAINT "Transaction_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."WorkVolume" DROP CONSTRAINT "WorkVolume_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."WorkVolume" DROP CONSTRAINT "WorkVolume_objetc_id_fkey";

-- AddForeignKey
ALTER TABLE "public"."WorkVolume" ADD CONSTRAINT "WorkVolume_objetc_id_fkey" FOREIGN KEY ("objetc_id") REFERENCES "public"."Object"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkVolume" ADD CONSTRAINT "WorkVolume_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskAssignment" ADD CONSTRAINT "TaskAssignment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskComment" ADD CONSTRAINT "TaskComment_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalaryPayment" ADD CONSTRAINT "SalaryPayment_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Entry" ADD CONSTRAINT "Entry_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
