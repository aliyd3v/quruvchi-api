/*
  Warnings:

  - The values [COMPLETED,CANCELLED,PENDING] on the enum `ContractStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('TASK_CREATED', 'FUND_APPROVED', 'CONTRACT_EXPIRED', 'GENERAL');

-- AlterEnum
BEGIN;
CREATE TYPE "public"."ContractStatus_new" AS ENUM ('ACTIVE', 'EXPIRED', 'MISSING');
ALTER TABLE "public"."Contract" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."Contract" ALTER COLUMN "status" TYPE "public"."ContractStatus_new" USING ("status"::text::"public"."ContractStatus_new");
ALTER TYPE "public"."ContractStatus" RENAME TO "ContractStatus_old";
ALTER TYPE "public"."ContractStatus_new" RENAME TO "ContractStatus";
DROP TYPE "public"."ContractStatus_old";
ALTER TABLE "public"."Contract" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- AlterTable
ALTER TABLE "public"."Contract" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "public"."Object" ADD COLUMN     "service_name" TEXT;

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" SERIAL NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "user_id" INTEGER NOT NULL,
    "type" "public"."NotificationType" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
