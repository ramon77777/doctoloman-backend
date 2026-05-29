-- CreateEnum
CREATE TYPE "MedicalAccessAuditAction" AS ENUM ('GRANT_ACCESS', 'REVOKE_ACCESS', 'OPEN_PATIENT_MEDICAL_RECORDS', 'OPEN_MEDICAL_RECORD', 'DOWNLOAD_MEDICAL_RECORD');

-- CreateTable
CREATE TABLE "MedicalAccess" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalAccessAudit" (
    "id" TEXT NOT NULL,
    "action" "MedicalAccessAuditAction" NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "medicalAccessId" TEXT,
    "medicalRecordId" TEXT,
    "medicalRecordTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalAccessAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MedicalAccess_patientId_idx" ON "MedicalAccess"("patientId");

-- CreateIndex
CREATE INDEX "MedicalAccess_professionalId_idx" ON "MedicalAccess"("professionalId");

-- CreateIndex
CREATE INDEX "MedicalAccess_revokedAt_idx" ON "MedicalAccess"("revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalAccess_patientId_professionalId_key" ON "MedicalAccess"("patientId", "professionalId");

-- CreateIndex
CREATE INDEX "MedicalAccessAudit_patientId_idx" ON "MedicalAccessAudit"("patientId");

-- CreateIndex
CREATE INDEX "MedicalAccessAudit_professionalId_idx" ON "MedicalAccessAudit"("professionalId");

-- CreateIndex
CREATE INDEX "MedicalAccessAudit_medicalAccessId_idx" ON "MedicalAccessAudit"("medicalAccessId");

-- CreateIndex
CREATE INDEX "MedicalAccessAudit_medicalRecordId_idx" ON "MedicalAccessAudit"("medicalRecordId");

-- CreateIndex
CREATE INDEX "MedicalAccessAudit_action_idx" ON "MedicalAccessAudit"("action");

-- CreateIndex
CREATE INDEX "MedicalAccessAudit_createdAt_idx" ON "MedicalAccessAudit"("createdAt");

-- AddForeignKey
ALTER TABLE "MedicalAccess" ADD CONSTRAINT "MedicalAccess_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalAccess" ADD CONSTRAINT "MedicalAccess_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalAccessAudit" ADD CONSTRAINT "MedicalAccessAudit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalAccessAudit" ADD CONSTRAINT "MedicalAccessAudit_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalAccessAudit" ADD CONSTRAINT "MedicalAccessAudit_medicalAccessId_fkey" FOREIGN KEY ("medicalAccessId") REFERENCES "MedicalAccess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalAccessAudit" ADD CONSTRAINT "MedicalAccessAudit_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "MedicalRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
