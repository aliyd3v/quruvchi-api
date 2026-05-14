/*
  Warnings:

  - You are about to drop the column `endDate` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `startDate` on the `Task` table. All the data in the column will be lost.
  - Added the required column `end_date` to the `Task` table without a default value. This is not possible if the table is not empty.
  - Added the required column `start_date` to the `Task` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `Transaction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Task" DROP COLUMN "endDate",
DROP COLUMN "startDate",
ADD COLUMN     "end_date" TIMESTAMPTZ(6) NOT NULL,
ADD COLUMN     "start_date" TIMESTAMPTZ(6) NOT NULL;

-- AlterTable
ALTER TABLE "public"."Transaction" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL,
ALTER COLUMN "date" SET DATA TYPE TIMESTAMPTZ(6);
