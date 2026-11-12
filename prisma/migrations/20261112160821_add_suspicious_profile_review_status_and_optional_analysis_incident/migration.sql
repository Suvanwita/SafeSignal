-- CreateEnum
CREATE TYPE "SuspiciousProfileStatus" AS ENUM ('PENDING_REVIEW', 'UNDER_REVIEW', 'MONITORING', 'ESCALATED', 'DISMISSED');

-- AlterTable
ALTER TABLE "analyses" ALTER COLUMN "incidentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "suspicious_profiles" ADD COLUMN     "profileImageUrl" TEXT,
ADD COLUMN     "reviewStatus" "SuspiciousProfileStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
ADD COLUMN     "reviewedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "suspicious_profiles_userId_reviewStatus_idx" ON "suspicious_profiles"("userId", "reviewStatus");
