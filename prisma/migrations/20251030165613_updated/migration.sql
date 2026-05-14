-- DropForeignKey
ALTER TABLE "public"."Object" DROP CONSTRAINT "Object_created_by_id_fkey";

-- AlterTable
ALTER TABLE "public"."Object" ALTER COLUMN "created_by_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."Object" ADD CONSTRAINT "Object_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
