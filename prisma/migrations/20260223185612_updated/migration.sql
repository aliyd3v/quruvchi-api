-- AlterTable
ALTER TABLE "public"."InventoryHistory" ADD COLUMN     "price_per_unit" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "total_price" BIGINT NOT NULL DEFAULT 0;
