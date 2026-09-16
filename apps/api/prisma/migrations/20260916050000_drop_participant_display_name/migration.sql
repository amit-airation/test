-- Identity is Company.id + Company.name only; drop per-participant displayName.
ALTER TABLE "RoundParticipant" DROP COLUMN IF EXISTS "displayName";
