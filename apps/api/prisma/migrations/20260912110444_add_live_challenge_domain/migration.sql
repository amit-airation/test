-- CreateEnum
CREATE TYPE "CompetitionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'LIVE', 'ENDED', 'FINALIZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('REGISTERED', 'READY', 'ACTIVE', 'DISCONNECTED', 'FINISHED', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "CompetitionEventType" AS ENUM ('CREATED', 'SCHEDULED', 'REGISTERED', 'JOINED', 'STARTED', 'JOB_CREATED', 'JOB_PUBLISHED', 'PUBLISH_FAILED', 'DISCONNECTED', 'RECONNECTED', 'SCREEN_SHARE_STARTED', 'SCREEN_SHARE_STOPPED', 'DISQUALIFIED', 'COMPETITION_ENDED', 'FINALIZED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "competitionId" TEXT;

-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CompetitionStatus" NOT NULL DEFAULT 'DRAFT',
    "durationSeconds" INTEGER NOT NULL DEFAULT 300,
    "scheduledStartAt" TIMESTAMP(3),
    "actualStartAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "winnerUserId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionParticipant" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'REGISTERED',
    "joinedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "finalScore" INTEGER NOT NULL DEFAULT 0,
    "finalRank" INTEGER,
    "scoreReachedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionEvent" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "participantId" TEXT,
    "eventType" "CompetitionEventType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Competition_status_scheduledStartAt_idx" ON "Competition"("status", "scheduledStartAt");

-- CreateIndex
CREATE INDEX "Competition_status_endAt_idx" ON "Competition"("status", "endAt");

-- CreateIndex
CREATE INDEX "CompetitionParticipant_competitionId_finalScore_scoreReache_idx" ON "CompetitionParticipant"("competitionId", "finalScore", "scoreReachedAt");

-- CreateIndex
CREATE INDEX "CompetitionParticipant_userId_idx" ON "CompetitionParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionParticipant_competitionId_userId_key" ON "CompetitionParticipant"("competitionId", "userId");

-- CreateIndex
CREATE INDEX "CompetitionEvent_competitionId_createdAt_idx" ON "CompetitionEvent"("competitionId", "createdAt");

-- CreateIndex
CREATE INDEX "CompetitionEvent_eventType_idx" ON "CompetitionEvent"("eventType");

-- CreateIndex
CREATE INDEX "Job_competitionId_status_createdById_publishedAt_idx" ON "Job"("competitionId", "status", "createdById", "publishedAt");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionParticipant" ADD CONSTRAINT "CompetitionParticipant_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionParticipant" ADD CONSTRAINT "CompetitionParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionParticipant" ADD CONSTRAINT "CompetitionParticipant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEvent" ADD CONSTRAINT "CompetitionEvent_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEvent" ADD CONSTRAINT "CompetitionEvent_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "CompetitionParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
