-- DropIndex
DROP INDEX "RoundParticipant_roundId_finalScore_scoreReachedAt_idx";

-- AlterTable
ALTER TABLE "RoundParticipant" ADD COLUMN     "targetReachedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "RoundParticipant_roundId_targetReachedAt_finalScore_scoreRe_idx" ON "RoundParticipant"("roundId", "targetReachedAt", "finalScore", "scoreReachedAt");
