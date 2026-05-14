-- AlterTable
ALTER TABLE "public"."Transaction" ADD COLUMN     "price_per_unit" BIGINT,
ADD COLUMN     "product_name" TEXT,
ADD COLUMN     "technical_parameters" TEXT,
ADD COLUMN     "unit" "public"."Unit";
