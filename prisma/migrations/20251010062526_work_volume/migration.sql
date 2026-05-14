-- AlterEnum
ALTER TYPE "public"."Role" ADD VALUE 'PTO';

-- CreateTable
CREATE TABLE "public"."WorkVolume" (
    "id" SERIAL NOT NULL,
    "objectId" INTEGER,
    "fundId" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" BIGINT NOT NULL,
    "totalAmount" BIGINT NOT NULL,
    "created_by_id" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkVolume_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."WorkVolume" ADD CONSTRAINT "WorkVolume_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "public"."Object"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkVolume" ADD CONSTRAINT "WorkVolume_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "public"."Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkVolume" ADD CONSTRAINT "WorkVolume_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
