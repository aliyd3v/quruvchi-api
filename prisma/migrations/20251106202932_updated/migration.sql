-- DropForeignKey
ALTER TABLE "public"."DebtHistory" DROP CONSTRAINT "DebtHistory_debtId_fkey";

-- AddForeignKey
ALTER TABLE "public"."DebtHistory" ADD CONSTRAINT "DebtHistory_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "public"."Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
