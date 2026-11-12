/*
  Warnings:

  - You are about to drop the column `summary` on the `abuse_reports` table. All the data in the column will be lost.
  - Added the required column `description` to the `abuse_reports` table without a default value. This is not possible if the table is not empty.
  - Added the required column `incidentDate` to the `abuse_reports` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `abuse_reports` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AbuseCategory" ADD VALUE 'CYBERBULLYING';
ALTER TYPE "AbuseCategory" ADD VALUE 'STALKING';
ALTER TYPE "AbuseCategory" ADD VALUE 'THREATS';
ALTER TYPE "AbuseCategory" ADD VALUE 'UNWANTED_CONTACT';
ALTER TYPE "AbuseCategory" ADD VALUE 'PRIVACY_VIOLATION';

-- DropForeignKey
ALTER TABLE "abuse_reports" DROP CONSTRAINT "abuse_reports_incidentId_fkey";

-- AlterTable
ALTER TABLE "abuse_reports" DROP COLUMN "summary",
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "incidentDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "title" TEXT NOT NULL,
ALTER COLUMN "incidentId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "abuse_reports_userId_category_idx" ON "abuse_reports"("userId", "category");

-- CreateIndex
CREATE INDEX "abuse_reports_userId_severity_idx" ON "abuse_reports"("userId", "severity");

-- CreateIndex
CREATE INDEX "abuse_reports_userId_incidentDate_idx" ON "abuse_reports"("userId", "incidentDate");

-- AddForeignKey
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
