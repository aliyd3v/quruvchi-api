-- CreateEnum
CREATE TYPE "public"."WorkVolumeStatus" AS ENUM ('OVERRUN');

-- AlterTable
ALTER TABLE "public"."Transaction" ADD COLUMN     "is_salary" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."WorkVolume" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."AnswerToWorkVolume" (
    "id" SERIAL NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" "public"."Unit" NOT NULL,
    "unit_price" BIGINT NOT NULL,
    "total_amount" BIGINT NOT NULL,
    "notes" TEXT,
    "work_volume_id" INTEGER NOT NULL,
    "created_by_id" INTEGER NOT NULL,
    "deleted_by_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AnswerToWorkVolume_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."AnswerToWorkVolume" ADD CONSTRAINT "AnswerToWorkVolume_work_volume_id_fkey" FOREIGN KEY ("work_volume_id") REFERENCES "public"."WorkVolume"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AnswerToWorkVolume" ADD CONSTRAINT "AnswerToWorkVolume_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AnswerToWorkVolume" ADD CONSTRAINT "AnswerToWorkVolume_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
