-- AlterTable
ALTER TABLE "public"."Attachment" ADD COLUMN     "catalog_id" INTEGER;

-- CreateTable
CREATE TABLE "public"."Catalog" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "amount" BIGINT NOT NULL,
    "sku" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" INTEGER,
    "deleted_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "Catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CatalogItem" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "parameter" TEXT,
    "quantity" DECIMAL(10,3),
    "price_per_unit" BIGINT,
    "totalPrice" BIGINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "unit" "public"."Unit",
    "catalog_id" INTEGER,
    "created_by_id" INTEGER,
    "deleted_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "public"."Catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Catalog" ADD CONSTRAINT "Catalog_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Catalog" ADD CONSTRAINT "Catalog_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CatalogItem" ADD CONSTRAINT "CatalogItem_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "public"."Catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CatalogItem" ADD CONSTRAINT "CatalogItem_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CatalogItem" ADD CONSTRAINT "CatalogItem_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
