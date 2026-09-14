-- AlterTable
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "location" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "employmentType" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "scoredAt" TIMESTAMP(3);
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CompetitionJobScore" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionJobScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Job_createdById_idempotencyKey_key" ON "Job"("createdById", "idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "CompetitionJobScore_jobId_key" ON "CompetitionJobScore"("jobId");
CREATE INDEX IF NOT EXISTS "CompetitionJobScore_competitionId_participantId_idx" ON "CompetitionJobScore"("competitionId", "participantId");
