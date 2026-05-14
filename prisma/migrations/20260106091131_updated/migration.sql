-- AlterTable
ALTER TABLE "public"."Debt" ADD COLUMN     "createdById" INTEGER;

-- AlterTable
ALTER TABLE "public"."DebtItem" ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "deletedById" INTEGER;

-- AlterTable
ALTER TABLE "public"."DebtPayment" ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "deletedById" INTEGER;

-- AlterTable
ALTER TABLE "public"."DebtTransaction" ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "deletedById" INTEGER;

-- AlterTable
ALTER TABLE "public"."SalaryMonth" ADD COLUMN     "deletedById" INTEGER;

-- AlterTable
ALTER TABLE "public"."SalaryPayment" ADD COLUMN     "deletedById" INTEGER;

-- AlterTable
ALTER TABLE "public"."TransactionItem" ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "deletedById" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."TransactionItem" ADD CONSTRAINT "TransactionItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TransactionItem" ADD CONSTRAINT "TransactionItem_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Debt" ADD CONSTRAINT "Debt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DebtTransaction" ADD CONSTRAINT "DebtTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DebtTransaction" ADD CONSTRAINT "DebtTransaction_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DebtItem" ADD CONSTRAINT "DebtItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DebtItem" ADD CONSTRAINT "DebtItem_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DebtPayment" ADD CONSTRAINT "DebtPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DebtPayment" ADD CONSTRAINT "DebtPayment_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalaryMonth" ADD CONSTRAINT "SalaryMonth_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SalaryPayment" ADD CONSTRAINT "SalaryPayment_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
