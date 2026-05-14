/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `Inventory` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Inventory_name_key" ON "public"."Inventory"("name");
