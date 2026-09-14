export const DEFAULT_COMPETITION_DURATION_SECONDS = 300;

export const EXTERNAL_JOB_WEBHOOK = {
  TIMESTAMP_HEADER: 'x-hirance-timestamp',
  SIGNATURE_HEADER: 'x-hirance-signature',
  SECRET_ENV: 'EXTERNAL_JOB_WEBHOOK_SECRET',
  SKEW_ENV: 'EXTERNAL_JOB_WEBHOOK_SKEW_SECONDS',
  ENABLED_ENV: 'EXTERNAL_JOB_WEBHOOK_ENABLED',
  REQUIRE_EXTERNAL_USER_ID_ENV: 'REQUIRE_EXTERNAL_USER_ID_ON_JOIN',
  DEFAULT_SKEW_SECONDS: 300,
} as const;

export const EXTERNAL_JOB_EVENTS = {
  PUBLISHED: 'JOB_PUBLISHED',
  UNPUBLISHED: 'JOB_UNPUBLISHED',
} as const;

export const INGEST_REASONS = {
  UNKNOWN_EXTERNAL_USER: 'unknown_external_user',
  NO_LIVE_COMPETITION: 'no_live_competition',
  MULTIPLE_LIVE_COMPETITIONS: 'multiple_live_competitions',
  ALREADY_SCORED: 'already_scored',
  COMPETITION_ENDED: 'competition_ended',
  COMPETITION_NOT_LIVE: 'competition_not_live',
  COMPETITION_FINALIZED: 'competition_finalized',
  UNKNOWN_EXTERNAL_JOB: 'unknown_external_job',
  ALREADY_UNPUBLISHED: 'already_unpublished',
  NOT_SCORED: 'not_scored',
  JOB_OWNER_MISMATCH: 'job_owner_mismatch',
  PUBLISH_REJECTED: 'publish_rejected',
} as const;

export const COMPETITION_ROOMS = {
  competition: (competitionId: string) => `competition:${competitionId}`,
  participant: (competitionId: string, participantId: string) =>
    `competition:${competitionId}:participant:${participantId}`,
} as const;
