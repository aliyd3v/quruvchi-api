/*
  Warnings:

  - You are about to drop the column `attempts` on the `AuthAttempts` table. All the data in the column will be lost.
  - Added the required column `user_id` to the `AuthAttempts` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."AuthAttempts" DROP COLUMN "attempts",
ADD COLUMN     "attempt_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "user_id" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."AuthAttempts" ADD CONSTRAINT "AuthAttempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
