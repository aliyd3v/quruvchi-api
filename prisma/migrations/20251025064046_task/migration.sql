-- DropForeignKey
ALTER TABLE "public"."TaskAssignment" DROP CONSTRAINT "TaskAssignment_user_id_fkey";

-- AlterTable
ALTER TABLE "public"."TaskAssignment" ALTER COLUMN "user_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."TaskAssignment" ADD CONSTRAINT "TaskAssignment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
