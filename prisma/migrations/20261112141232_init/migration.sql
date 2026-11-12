-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('X', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'YOUTUBE', 'LINKEDIN', 'TELEGRAM', 'WHATSAPP', 'DISCORD', 'REDDIT', 'EMAIL', 'WEBSITE', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'ESCALATED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AbuseCategory" AS ENUM ('IMPERSONATION', 'HARASSMENT', 'SCAM_FRAUD', 'PHISHING', 'DOXXING', 'EXTORTION', 'HATE_SPEECH', 'NON_CONSENSUAL_CONTENT', 'COPYRIGHT_TRADEMARK', 'OTHER');

-- CreateEnum
CREATE TYPE "AnalysisType" AS ENUM ('IMPERSONATION_MATCH', 'CONTENT_CLASSIFICATION', 'RISK_SCORING', 'METADATA_EXTRACTION', 'SIMILARITY_CHECK', 'SUMMARY');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT,
    "profileUrl" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suspicious_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT,
    "profileUrl" TEXT,
    "bio" TEXT,
    "firstSeenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suspicious_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "officialAccountId" UUID,
    "suspiciousProfileId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "category" "AbuseCategory" NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abuse_reports" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "suspiciousProfileId" UUID,
    "platform" "Platform" NOT NULL,
    "category" "AbuseCategory" NOT NULL,
    "targetUrl" TEXT,
    "referenceNumber" TEXT,
    "reportStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "summary" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "abuse_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "abuseReportId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceUrl" TEXT,
    "storageKey" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "sha256" TEXT,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_events" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analyses" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "officialAccountId" UUID,
    "suspiciousProfileId" UUID,
    "evidenceId" UUID,
    "type" "AnalysisType" NOT NULL,
    "summary" TEXT,
    "confidence" DOUBLE PRECISION,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "official_accounts_userId_idx" ON "official_accounts"("userId");

-- CreateIndex
CREATE INDEX "official_accounts_platform_handle_idx" ON "official_accounts"("platform", "handle");

-- CreateIndex
CREATE UNIQUE INDEX "official_accounts_userId_platform_handle_key" ON "official_accounts"("userId", "platform", "handle");

-- CreateIndex
CREATE INDEX "suspicious_profiles_userId_idx" ON "suspicious_profiles"("userId");

-- CreateIndex
CREATE INDEX "suspicious_profiles_userId_platform_idx" ON "suspicious_profiles"("userId", "platform");

-- CreateIndex
CREATE INDEX "suspicious_profiles_platform_handle_idx" ON "suspicious_profiles"("platform", "handle");

-- CreateIndex
CREATE INDEX "incidents_userId_idx" ON "incidents"("userId");

-- CreateIndex
CREATE INDEX "incidents_userId_status_idx" ON "incidents"("userId", "status");

-- CreateIndex
CREATE INDEX "incidents_userId_severity_idx" ON "incidents"("userId", "severity");

-- CreateIndex
CREATE INDEX "incidents_userId_category_idx" ON "incidents"("userId", "category");

-- CreateIndex
CREATE INDEX "incidents_officialAccountId_idx" ON "incidents"("officialAccountId");

-- CreateIndex
CREATE INDEX "incidents_suspiciousProfileId_idx" ON "incidents"("suspiciousProfileId");

-- CreateIndex
CREATE INDEX "incidents_createdAt_idx" ON "incidents"("createdAt");

-- CreateIndex
CREATE INDEX "abuse_reports_userId_idx" ON "abuse_reports"("userId");

-- CreateIndex
CREATE INDEX "abuse_reports_incidentId_idx" ON "abuse_reports"("incidentId");

-- CreateIndex
CREATE INDEX "abuse_reports_suspiciousProfileId_idx" ON "abuse_reports"("suspiciousProfileId");

-- CreateIndex
CREATE INDEX "abuse_reports_platform_reportStatus_idx" ON "abuse_reports"("platform", "reportStatus");

-- CreateIndex
CREATE INDEX "abuse_reports_referenceNumber_idx" ON "abuse_reports"("referenceNumber");

-- CreateIndex
CREATE INDEX "evidence_userId_idx" ON "evidence"("userId");

-- CreateIndex
CREATE INDEX "evidence_incidentId_idx" ON "evidence"("incidentId");

-- CreateIndex
CREATE INDEX "evidence_abuseReportId_idx" ON "evidence"("abuseReportId");

-- CreateIndex
CREATE INDEX "evidence_sha256_idx" ON "evidence"("sha256");

-- CreateIndex
CREATE INDEX "timeline_events_userId_idx" ON "timeline_events"("userId");

-- CreateIndex
CREATE INDEX "timeline_events_incidentId_occurredAt_idx" ON "timeline_events"("incidentId", "occurredAt");

-- CreateIndex
CREATE INDEX "timeline_events_eventType_idx" ON "timeline_events"("eventType");

-- CreateIndex
CREATE INDEX "analyses_userId_idx" ON "analyses"("userId");

-- CreateIndex
CREATE INDEX "analyses_incidentId_idx" ON "analyses"("incidentId");

-- CreateIndex
CREATE INDEX "analyses_incidentId_type_idx" ON "analyses"("incidentId", "type");

-- CreateIndex
CREATE INDEX "analyses_officialAccountId_idx" ON "analyses"("officialAccountId");

-- CreateIndex
CREATE INDEX "analyses_suspiciousProfileId_idx" ON "analyses"("suspiciousProfileId");

-- CreateIndex
CREATE INDEX "analyses_evidenceId_idx" ON "analyses"("evidenceId");

-- AddForeignKey
ALTER TABLE "official_accounts" ADD CONSTRAINT "official_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suspicious_profiles" ADD CONSTRAINT "suspicious_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_officialAccountId_fkey" FOREIGN KEY ("officialAccountId") REFERENCES "official_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_suspiciousProfileId_fkey" FOREIGN KEY ("suspiciousProfileId") REFERENCES "suspicious_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_suspiciousProfileId_fkey" FOREIGN KEY ("suspiciousProfileId") REFERENCES "suspicious_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_abuseReportId_fkey" FOREIGN KEY ("abuseReportId") REFERENCES "abuse_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_officialAccountId_fkey" FOREIGN KEY ("officialAccountId") REFERENCES "official_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_suspiciousProfileId_fkey" FOREIGN KEY ("suspiciousProfileId") REFERENCES "suspicious_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
