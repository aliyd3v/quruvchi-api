-- AlterTable
ALTER TABLE "public"."Inbox" ADD COLUMN     "deleted_by_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."Inbox" ADD CONSTRAINT "Inbox_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
