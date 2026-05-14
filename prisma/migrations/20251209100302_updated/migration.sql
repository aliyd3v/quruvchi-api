-- CreateEnum
CREATE TYPE "public"."LotTaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROCESS', 'CHECKING', 'COMPLETED');

-- AlterTable
ALTER TABLE "public"."Attachment" ADD COLUMN     "lotTaskComplatedId" INTEGER,
ADD COLUMN     "lotTaskId" INTEGER;

-- CreateTable
CREATE TABLE "public"."LotTask" (
    "id" SERIAL NOT NULL,
    "task_description" TEXT NOT NULL,
    "completed_description" TEXT,
    "status" "public"."LotTaskStatus",
    "lot_id" INTEGER,
    "completedById" INTEGER,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "LotTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."_LotTaskToUser" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_LotTaskToUser_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_LotTaskToUser_B_index" ON "public"."_LotTaskToUser"("B");

-- AddForeignKey
ALTER TABLE "public"."LotTask" ADD CONSTRAINT "LotTask_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "public"."Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LotTask" ADD CONSTRAINT "LotTask_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LotTask" ADD CONSTRAINT "LotTask_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_lotTaskId_fkey" FOREIGN KEY ("lotTaskId") REFERENCES "public"."LotTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attachment" ADD CONSTRAINT "Attachment_lotTaskComplatedId_fkey" FOREIGN KEY ("lotTaskComplatedId") REFERENCES "public"."LotTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_LotTaskToUser" ADD CONSTRAINT "_LotTaskToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."LotTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_LotTaskToUser" ADD CONSTRAINT "_LotTaskToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
