-- DropIndex
DROP INDEX IF EXISTS "RoundParticipant_roundId_targetReachedAt_finalScore_scoreRe_idx";

-- AlterTable
ALTER TABLE "Competition" DROP COLUMN IF EXISTS "targetJobCount";

-- AlterTable
ALTER TABLE "RoundParticipant" DROP COLUMN IF EXISTS "targetReachedAt";

-- CreateIndex
CREATE INDEX "RoundParticipant_roundId_finalScore_scoreReachedAt_idx" ON "RoundParticipant"("roundId", "finalScore", "scoreReachedAt");
