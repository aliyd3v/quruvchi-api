-- AlterTable
ALTER TABLE "public"."Task" ADD COLUMN     "product_name" TEXT,
ADD COLUMN     "quantity" INTEGER,
ADD COLUMN     "technical_parameters" TEXT,
ADD COLUMN     "unit" "public"."Unit";
