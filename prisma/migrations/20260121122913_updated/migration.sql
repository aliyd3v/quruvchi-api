/*
  Warnings:

  - The values [WHITE] on the enum `EntryColor` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."EntryColor_new" AS ENUM ('GREEN', 'ORANGE', 'YELLOW', 'RED', 'BLUE', 'DARK', 'LIGHT');
ALTER TABLE "public"."Entry" ALTER COLUMN "color" TYPE "public"."EntryColor_new" USING ("color"::text::"public"."EntryColor_new");
ALTER TYPE "public"."EntryColor" RENAME TO "EntryColor_old";
ALTER TYPE "public"."EntryColor_new" RENAME TO "EntryColor";
DROP TYPE "public"."EntryColor_old";
COMMIT;
