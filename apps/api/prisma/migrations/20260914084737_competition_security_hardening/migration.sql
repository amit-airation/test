-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "allowOpenJoin" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "CompetitionEvent_competitionId_eventType_createdAt_idx" ON "CompetitionEvent"("competitionId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "CompetitionEvent_participantId_createdAt_idx" ON "CompetitionEvent"("participantId", "createdAt");
