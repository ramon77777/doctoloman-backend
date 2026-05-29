-- CreateTable
CREATE TABLE "PharmacyNearbySearchCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusKm" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'OPENSTREETMAP',
    "response" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyNearbySearchCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyNearbySearchCache_cacheKey_key" ON "PharmacyNearbySearchCache"("cacheKey");

-- CreateIndex
CREATE INDEX "PharmacyNearbySearchCache_expiresAt_idx" ON "PharmacyNearbySearchCache"("expiresAt");

-- CreateIndex
CREATE INDEX "PharmacyNearbySearchCache_latitude_longitude_idx" ON "PharmacyNearbySearchCache"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "PharmacyNearbySearchCache_radiusKm_idx" ON "PharmacyNearbySearchCache"("radiusKm");
