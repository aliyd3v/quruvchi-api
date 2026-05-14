-- DropForeignKey
ALTER TABLE "public"."AnswerToWorkVolume" DROP CONSTRAINT "AnswerToWorkVolume_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."AnswerToWorkVolume" DROP CONSTRAINT "AnswerToWorkVolume_work_volume_id_fkey";

-- AddForeignKey
ALTER TABLE "public"."AnswerToWorkVolume" ADD CONSTRAINT "AnswerToWorkVolume_work_volume_id_fkey" FOREIGN KEY ("work_volume_id") REFERENCES "public"."WorkVolume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AnswerToWorkVolume" ADD CONSTRAINT "AnswerToWorkVolume_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
