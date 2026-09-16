/*
  Warnings:

  - You are about to drop the column `createdById` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the `CompanyMembership` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[mobile]` on the table `Company` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[externalJobId]` on the table `Job` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `mobile` to the `Company` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CompetitionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'LIVE', 'ENDED', 'FINALIZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('REGISTERED', 'READY', 'ACTIVE', 'DISCONNECTED', 'FINISHED', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "JobSource" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "CompetitionEventType" AS ENUM ('CREATED', 'CANCELLED', 'ROUND_CREATED', 'ROUND_SCHEDULED', 'ROUND_STARTED', 'ROUND_ENDED', 'ROUND_FINALIZED', 'ROUND_CANCELLED', 'REGISTERED', 'JOINED', 'DISCONNECTED', 'RECONNECTED', 'DISQUALIFIED', 'JOB_PUBLISHED', 'JOB_UNPUBLISHED', 'PUBLISH_FAILED', 'SCREEN_SHARE_STARTED', 'SCREEN_SHARE_STOPPED');

-- DropForeignKey
ALTER TABLE "CompanyMembership" DROP CONSTRAINT "CompanyMembership_companyId_fkey";

-- DropForeignKey
ALTER TABLE "CompanyMembership" DROP CONSTRAINT "CompanyMembership_userId_fkey";

-- DropForeignKey
ALTER TABLE "Job" DROP CONSTRAINT "Job_companyId_fkey";

-- DropForeignKey
ALTER TABLE "Job" DROP CONSTRAINT "Job_createdById_fkey";

-- DropIndex
DROP INDEX "Job_createdById_status_publishedAt_idx";

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "mobile" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Job" DROP COLUMN "createdById",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "employmentType" TEXT,
ADD COLUMN     "externalJobId" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "roundId" TEXT,
ADD COLUMN     "scoredAt" TIMESTAMP(3),
ADD COLUMN     "source" "JobSource" NOT NULL DEFAULT 'EXTERNAL',
ALTER COLUMN "companyId" DROP NOT NULL;

-- DropTable
DROP TABLE "CompanyMembership";

-- DropTable
DROP TABLE "User";

-- DropEnum
DROP TYPE "UserRole";

-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CompetitionStatus" NOT NULL DEFAULT 'DRAFT',
    "activeRoundId" TEXT,
    "joinPinHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "name" TEXT,
    "status" "RoundStatus" NOT NULL DEFAULT 'DRAFT',
    "durationSeconds" INTEGER NOT NULL DEFAULT 300,
    "scheduledStartAt" TIMESTAMP(3),
    "actualStartAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "winnerCompanyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundParticipant" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'REGISTERED',
    "joinedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "finalScore" INTEGER NOT NULL DEFAULT 0,
    "finalRank" INTEGER,
    "scoreReachedAt" TIMESTAMP(3),
    "lastScoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoundParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundJobScore" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "postDurationSeconds" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoundJobScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionEvent" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "roundId" TEXT,
    "roundParticipantId" TEXT,
    "eventType" "CompetitionEventType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Competition_activeRoundId_key" ON "Competition"("activeRoundId");

-- CreateIndex
CREATE INDEX "Round_competitionId_status_idx" ON "Round"("competitionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Round_competitionId_roundNumber_key" ON "Round"("competitionId", "roundNumber");

-- CreateIndex
CREATE INDEX "RoundParticipant_roundId_finalScore_scoreReachedAt_idx" ON "RoundParticipant"("roundId", "finalScore", "scoreReachedAt");

-- CreateIndex
CREATE INDEX "RoundParticipant_companyId_idx" ON "RoundParticipant"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "RoundParticipant_roundId_companyId_key" ON "RoundParticipant"("roundId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "RoundJobScore_jobId_key" ON "RoundJobScore"("jobId");

-- CreateIndex
CREATE INDEX "RoundJobScore_roundId_participantId_idx" ON "RoundJobScore"("roundId", "participantId");

-- CreateIndex
CREATE INDEX "CompetitionEvent_competitionId_createdAt_idx" ON "CompetitionEvent"("competitionId", "createdAt");

-- CreateIndex
CREATE INDEX "CompetitionEvent_roundId_createdAt_idx" ON "CompetitionEvent"("roundId", "createdAt");

-- CreateIndex
CREATE INDEX "CompetitionEvent_eventType_idx" ON "CompetitionEvent"("eventType");

-- CreateIndex
CREATE INDEX "CompetitionEvent_roundParticipantId_createdAt_idx" ON "CompetitionEvent"("roundParticipantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Company_mobile_key" ON "Company"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "Job_externalJobId_key" ON "Job"("externalJobId");

-- CreateIndex
CREATE INDEX "Job_roundId_status_idx" ON "Job"("roundId", "status");

-- CreateIndex
CREATE INDEX "Job_source_externalJobId_idx" ON "Job"("source", "externalJobId");

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_activeRoundId_fkey" FOREIGN KEY ("activeRoundId") REFERENCES "Round"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundParticipant" ADD CONSTRAINT "RoundParticipant_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundParticipant" ADD CONSTRAINT "RoundParticipant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEvent" ADD CONSTRAINT "CompetitionEvent_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEvent" ADD CONSTRAINT "CompetitionEvent_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEvent" ADD CONSTRAINT "CompetitionEvent_roundParticipantId_fkey" FOREIGN KEY ("roundParticipantId") REFERENCES "RoundParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
