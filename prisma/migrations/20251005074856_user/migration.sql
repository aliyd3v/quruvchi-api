/*
  Warnings:

  - You are about to drop the column `address` on the `Object` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Contract" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "public"."Object" DROP COLUMN "address";

-- CreateTable
CREATE TABLE "public"."Location" (
    "id" SERIAL NOT NULL,
    "object_id" INTEGER NOT NULL,
    "name" TEXT,
    "lat" DECIMAL(9,6) NOT NULL,
    "lon" DECIMAL(9,6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."_ObjectToUser" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_ObjectToUser_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ObjectToUser_B_index" ON "public"."_ObjectToUser"("B");

-- AddForeignKey
ALTER TABLE "public"."Location" ADD CONSTRAINT "Location_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "public"."Object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_ObjectToUser" ADD CONSTRAINT "_ObjectToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Object"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_ObjectToUser" ADD CONSTRAINT "_ObjectToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
