-- AlterTable
ALTER TABLE "public"."CatalogItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "public"."DebtItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "public"."Inventory" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "total_input" SET DEFAULT 0,
ALTER COLUMN "total_input" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "total_output" SET DEFAULT 0,
ALTER COLUMN "total_output" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "public"."InventoryHistory" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "public"."Task" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,3),
ALTER COLUMN "quantity_of_complated" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "public"."TaskHistory" ALTER COLUMN "quatnity_of_complated" SET DATA TYPE DECIMAL(18,3);

-- AlterTable
ALTER TABLE "public"."TransactionItem" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,3);
