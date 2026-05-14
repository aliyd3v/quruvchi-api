-- AlterTable
ALTER TABLE "public"."Branch" ADD COLUMN     "created_by_id" INTEGER,
ADD COLUMN     "deleted_by_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."Branch" ADD CONSTRAINT "Branch_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Branch" ADD CONSTRAINT "Branch_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
