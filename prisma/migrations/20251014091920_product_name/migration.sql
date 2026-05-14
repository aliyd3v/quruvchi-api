-- CreateEnum
CREATE TYPE "public"."ProjectType" AS ENUM ('REPAIR', 'CONSTRUCTION', 'EQUIPMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."WorkType" AS ENUM ('CONSTRUCTION', 'INSTALLATION', 'OTHER');

-- AlterTable
ALTER TABLE "public"."Object" ADD COLUMN     "product_name_id" INTEGER,
ADD COLUMN     "project_type" "public"."ProjectType",
ADD COLUMN     "work_type" "public"."WorkType";

-- AlterTable
ALTER TABLE "public"."WorkVolume" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "public"."ProductName" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductName_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductName_name_key" ON "public"."ProductName"("name");

-- AddForeignKey
ALTER TABLE "public"."Object" ADD CONSTRAINT "Object_product_name_id_fkey" FOREIGN KEY ("product_name_id") REFERENCES "public"."ProductName"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductName" ADD CONSTRAINT "ProductName_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
