-- DropForeignKey
ALTER TABLE "public"."Avatar" DROP CONSTRAINT "Avatar_user_id_fkey";

-- AddForeignKey
ALTER TABLE "public"."Avatar" ADD CONSTRAINT "Avatar_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
