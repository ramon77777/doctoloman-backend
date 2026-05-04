-- CreateTable
CREATE TABLE "Pharmacy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "city" TEXT NOT NULL,
    "area" TEXT,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pharmacy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyDutyPeriod" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyDutyPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pharmacy_city_idx" ON "Pharmacy"("city");

-- CreateIndex
CREATE INDEX "Pharmacy_area_idx" ON "Pharmacy"("area");

-- CreateIndex
CREATE INDEX "Pharmacy_isActive_idx" ON "Pharmacy"("isActive");

-- CreateIndex
CREATE INDEX "PharmacyDutyPeriod_pharmacyId_idx" ON "PharmacyDutyPeriod"("pharmacyId");

-- CreateIndex
CREATE INDEX "PharmacyDutyPeriod_startsAt_idx" ON "PharmacyDutyPeriod"("startsAt");

-- CreateIndex
CREATE INDEX "PharmacyDutyPeriod_endsAt_idx" ON "PharmacyDutyPeriod"("endsAt");

-- AddForeignKey
ALTER TABLE "PharmacyDutyPeriod" ADD CONSTRAINT "PharmacyDutyPeriod_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
