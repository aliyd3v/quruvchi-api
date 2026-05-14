/*
  Warnings:

  - You are about to drop the column `object_id` on the `Location` table. All the data in the column will be lost.
  - Added the required column `location_id` to the `Object` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Location" DROP CONSTRAINT "Location_object_id_fkey";

-- AlterTable
ALTER TABLE "public"."Location" DROP COLUMN "object_id";

-- AlterTable
ALTER TABLE "public"."Object" ADD COLUMN     "location_id" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."Object" ADD CONSTRAINT "Object_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
