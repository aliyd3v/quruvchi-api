-- AlterTable
ALTER TABLE "public"."Organization" ADD COLUMN     "parent_id" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."Organization" ADD CONSTRAINT "Organization_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
