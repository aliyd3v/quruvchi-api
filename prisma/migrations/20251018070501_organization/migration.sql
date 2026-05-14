/*
  Warnings:

  - You are about to drop the column `name` on the `Organization` table. All the data in the column will be lost.
  - Added the required column `organization_name` to the `Organization` table without a default value. This is not possible if the table is not empty.
  - Added the required column `owner_name` to the `Organization` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stir_number` to the `Organization` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Debt" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "public"."Organization" DROP COLUMN "name",
ADD COLUMN     "location_id" INTEGER,
ADD COLUMN     "organization_name" VARCHAR(255) NOT NULL,
ADD COLUMN     "owner_name" VARCHAR(255) NOT NULL,
ADD COLUMN     "owner_phone" VARCHAR(20),
ADD COLUMN     "seller_phone" VARCHAR(20),
ADD COLUMN     "stir_number" VARCHAR(255) NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."Organization" ADD CONSTRAINT "Organization_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
