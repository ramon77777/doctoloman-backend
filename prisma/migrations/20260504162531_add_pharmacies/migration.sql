/*
  Warnings:

  - A unique constraint covering the columns `[phone]` on the table `Pharmacy` will be added. If there are existing duplicate values, this will fail.
  - Made the column `phone` on table `Pharmacy` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Pharmacy" ADD COLUMN     "isOnDuty" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "phone" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Pharmacy_phone_key" ON "Pharmacy"("phone");

-- CreateIndex
CREATE INDEX "Pharmacy_isOnDuty_idx" ON "Pharmacy"("isOnDuty");
