-- AlterTable
ALTER TABLE "public"."Catalog" ADD COLUMN     "direction_id" INTEGER;

-- CreateTable
CREATE TABLE "public"."CatalogDirection" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" INTEGER,
    "deleted_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "CatalogDirection_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Catalog" ADD CONSTRAINT "Catalog_direction_id_fkey" FOREIGN KEY ("direction_id") REFERENCES "public"."CatalogDirection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CatalogDirection" ADD CONSTRAINT "CatalogDirection_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CatalogDirection" ADD CONSTRAINT "CatalogDirection_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
