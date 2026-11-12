-- CreateTable
CREATE TABLE "incident_suspicious_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "suspiciousProfileId" UUID NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_suspicious_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incident_suspicious_profiles_userId_idx" ON "incident_suspicious_profiles"("userId");

-- CreateIndex
CREATE INDEX "incident_suspicious_profiles_incidentId_idx" ON "incident_suspicious_profiles"("incidentId");

-- CreateIndex
CREATE INDEX "incident_suspicious_profiles_suspiciousProfileId_idx" ON "incident_suspicious_profiles"("suspiciousProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "incident_suspicious_profiles_incidentId_suspiciousProfileId_key" ON "incident_suspicious_profiles"("incidentId", "suspiciousProfileId");

-- AddForeignKey
ALTER TABLE "incident_suspicious_profiles" ADD CONSTRAINT "incident_suspicious_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_suspicious_profiles" ADD CONSTRAINT "incident_suspicious_profiles_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_suspicious_profiles" ADD CONSTRAINT "incident_suspicious_profiles_suspiciousProfileId_fkey" FOREIGN KEY ("suspiciousProfileId") REFERENCES "suspicious_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
