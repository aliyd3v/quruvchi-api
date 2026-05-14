/*
  Warnings:

  - Added the required column `type` to the `InventoryHistory` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."InventoryHistoryType" AS ENUM ('INPUT', 'OUTPUT');

-- AlterTable
ALTER TABLE "public"."Inventory" ADD COLUMN     "price_per_unit" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "total_price" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."InventoryHistory" ADD COLUMN     "type" "public"."InventoryHistoryType" NOT NULL;

-- CreateTable
CREATE TABLE "public"."InventoryAvatar" (
    "id" SERIAL NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryAvatar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryAvatar_user_id_key" ON "public"."InventoryAvatar"("user_id");

-- AddForeignKey
ALTER TABLE "public"."InventoryAvatar" ADD CONSTRAINT "InventoryAvatar_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."Inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
