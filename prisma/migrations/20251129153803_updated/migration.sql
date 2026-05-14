-- AlterTable
ALTER TABLE "public"."Entry" ADD COLUMN     "branch_id" INTEGER;

-- CreateTable
CREATE TABLE "public"."Branch" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "stir" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "total_expense" BIGINT NOT NULL DEFAULT 0,
    "totla_income" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Entry" ADD CONSTRAINT "Entry_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
