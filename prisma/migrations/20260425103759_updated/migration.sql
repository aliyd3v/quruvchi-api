-- AlterTable
ALTER TABLE "public"."Catalog" ADD COLUMN     "desc_en" TEXT,
ADD COLUMN     "desc_ru" TEXT,
ADD COLUMN     "desc_uz" TEXT,
ADD COLUMN     "title_en" TEXT,
ADD COLUMN     "title_ru" TEXT,
ADD COLUMN     "title_uz" TEXT;

-- AlterTable
ALTER TABLE "public"."CatalogDirection" ADD COLUMN     "title_en" TEXT,
ADD COLUMN     "title_ru" TEXT,
ADD COLUMN     "title_uz" TEXT;
