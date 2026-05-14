-- CreateEnum
CREATE TYPE "public"."InboxType" AS ENUM ('ORDER_PRODUCT', 'ORDER_SERVICE', 'CONTACT');

-- CreateEnum
CREATE TYPE "public"."InboxStatus" AS ENUM ('PENDING', 'WORKING', 'COMPLETED', 'CANCELED');

-- CreateTable
CREATE TABLE "public"."Inbox" (
    "id" SERIAL NOT NULL,
    "message" TEXT,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "type" "public"."InboxType" NOT NULL DEFAULT 'CONTACT',
    "status" "public"."InboxStatus" NOT NULL DEFAULT 'PENDING',
    "serviceId" INTEGER,
    "catalogId" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "Inbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."_InboxToUser" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_InboxToUser_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_InboxToUser_B_index" ON "public"."_InboxToUser"("B");

-- AddForeignKey
ALTER TABLE "public"."Inbox" ADD CONSTRAINT "Inbox_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "public"."Services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Inbox" ADD CONSTRAINT "Inbox_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "public"."Catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_InboxToUser" ADD CONSTRAINT "_InboxToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_InboxToUser" ADD CONSTRAINT "_InboxToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
