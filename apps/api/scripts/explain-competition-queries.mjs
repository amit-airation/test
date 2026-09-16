/**
 * Index review helper for round-based scoring.
 *
 *   COMPETITION_ID=<uuid> ROUND_ID=<uuid> node scripts/explain-competition-queries.mjs
 *
 * Requires DATABASE_URL and `psql` on PATH.
 */
import { spawnSync } from 'node:child_process';

const competitionId = process.env.COMPETITION_ID;
const roundId = process.env.ROUND_ID;
if (!competitionId || !roundId) {
  console.error('Set COMPETITION_ID and ROUND_ID to real UUIDs');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const queries = [
  [
    'round_leaderboard_order',
    `EXPLAIN (ANALYZE, BUFFERS)
     SELECT id, "finalScore", "scoreReachedAt"
     FROM "RoundParticipant"
     WHERE "roundId" = '${roundId}'
     ORDER BY "finalScore" DESC, "scoreReachedAt" ASC NULLS LAST, "createdAt" ASC;`,
  ],
  [
    'live_rounds_by_end',
    `EXPLAIN (ANALYZE, BUFFERS)
     SELECT id FROM "Round"
     WHERE status = 'LIVE' AND "endAt" IS NOT NULL
     ORDER BY "endAt" ASC
     LIMIT 50;`,
  ],
  [
    'round_jobs_published',
    `EXPLAIN (ANALYZE, BUFFERS)
     SELECT id FROM "Job"
     WHERE "roundId" = '${roundId}'
       AND status = 'PUBLISHED'
       AND "publishedAt" IS NOT NULL;`,
  ],
  [
    'competition_events_timeline',
    `EXPLAIN (ANALYZE, BUFFERS)
     SELECT id, "eventType"
     FROM "CompetitionEvent"
     WHERE "competitionId" = '${competitionId}'
     ORDER BY "createdAt" DESC
     LIMIT 100;`,
  ],
];

for (const [name, sql] of queries) {
  console.log(`\n=== ${name} ===`);
  const result = spawnSync('psql', [process.env.DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  console.log(result.stdout);
}

console.log(`
Index review checklist (schema already includes):
- Round(competitionId, status)
- RoundParticipant(roundId, finalScore, scoreReachedAt)
- RoundParticipant(companyId)
- Job(roundId, status) / (companyId, status) / (source, externalJobId)
- RoundJobScore(roundId, participantId) / jobId UNIQUE
- CompetitionEvent(competitionId, createdAt)
Add new indexes only when EXPLAIN shows sequential scans under load.
`);
