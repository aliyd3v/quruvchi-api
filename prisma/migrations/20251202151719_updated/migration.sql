/*
  Warnings:

  - You are about to drop the column `status` on the `Contract` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Contract" DROP CONSTRAINT "Contract_object_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Lot" DROP CONSTRAINT "Lot_contract_id_fkey";

-- AlterTable
ALTER TABLE "public"."Contract" DROP COLUMN "status";

-- AlterTable
ALTER TABLE "public"."SalaryPayment" ALTER COLUMN "created_by_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."TaskComment" ALTER COLUMN "created_by_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."Transaction" ALTER COLUMN "created_by_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."WorkVolume" ALTER COLUMN "created_by_id" DROP NOT NULL;

-- DropEnum
DROP TYPE "public"."ContractStatus";
