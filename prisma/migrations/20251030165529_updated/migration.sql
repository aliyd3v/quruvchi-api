-- DropForeignKey
ALTER TABLE "public"."Object" DROP CONSTRAINT "Object_location_id_fkey";

-- AlterTable
ALTER TABLE "public"."Object" ALTER COLUMN "location_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."Object" ADD CONSTRAINT "Object_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
