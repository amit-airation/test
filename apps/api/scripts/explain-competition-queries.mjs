/**
 * Phase 8 index review helper (details.md §41).
 *
 * Prints EXPLAIN for the hottest competition query shapes. Run against a
 * populated competition id:
 *
 *   COMPETITION_ID=<uuid> node scripts/explain-competition-queries.mjs
 *
 * Requires DATABASE_URL and `psql` on PATH.
 */
import { spawnSync } from 'node:child_process';

const competitionId = process.env.COMPETITION_ID;
if (!competitionId) {
  console.error('Set COMPETITION_ID to a real competition UUID');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const queries = [
  [
    'leaderboard_order',
    `EXPLAIN (ANALYZE, BUFFERS)
     SELECT id, "finalScore", "scoreReachedAt"
     FROM "CompetitionParticipant"
     WHERE "competitionId" = '${competitionId}'
     ORDER BY "finalScore" DESC, "scoreReachedAt" ASC NULLS LAST, "createdAt" ASC;`,
  ],
  [
    'live_competitions_by_end',
    `EXPLAIN (ANALYZE, BUFFERS)
     SELECT id FROM "Competition"
     WHERE status = 'LIVE' AND "endAt" IS NOT NULL
     ORDER BY "endAt" ASC
     LIMIT 50;`,
  ],
  [
    'competition_jobs_published',
    `EXPLAIN (ANALYZE, BUFFERS)
     SELECT id FROM "Job"
     WHERE "competitionId" = '${competitionId}'
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
- Competition(status, scheduledStartAt) / (status, endAt)
- CompetitionParticipant(competitionId, finalScore, scoreReachedAt)
- Job(competitionId, status, createdById, publishedAt)
- CompetitionEvent(competitionId, eventType, createdAt)
- User.externalUserId UNIQUE
Add new indexes only when EXPLAIN shows sequential scans under load.
`);
