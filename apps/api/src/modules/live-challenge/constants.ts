export const DEFAULT_ROUND_DURATION_SECONDS = 300;

/** Scoring grace period after round.endAt (milliseconds). */
export const ROUND_GRACE_PERIOD_MS = 3_000;

export const EXTERNAL_JOB_WEBHOOK = {
  TIMESTAMP_HEADER: 'x-hirance-timestamp',
  SIGNATURE_HEADER: 'x-hirance-signature',
  SECRET_ENV: 'EXTERNAL_JOB_WEBHOOK_SECRET',
  SKEW_ENV: 'EXTERNAL_JOB_WEBHOOK_SKEW_SECONDS',
  ENABLED_ENV: 'EXTERNAL_JOB_WEBHOOK_ENABLED',
  DEFAULT_SKEW_SECONDS: 300,
} as const;

export const EXTERNAL_JOB_EVENTS = {
  PUBLISHED: 'JOB_PUBLISHED',
  UNPUBLISHED: 'JOB_UNPUBLISHED',
} as const;

export const INGEST_REASONS = {
  UNKNOWN_COMPANY: 'unknown_company',
  NO_LIVE_ROUND: 'no_live_round',
  MULTIPLE_LIVE_ROUNDS: 'multiple_live_rounds',
  ALREADY_SCORED: 'already_scored',
  OUTSIDE_SCORING_WINDOW: 'outside_scoring_window',
  ROUND_FINALIZED: 'round_finalized',
  UNKNOWN_EXTERNAL_JOB: 'unknown_external_job',
  ALREADY_UNPUBLISHED: 'already_unpublished',
  NOT_SCORED: 'not_scored',
  JOB_OWNER_MISMATCH: 'job_owner_mismatch',
  PUBLISH_REJECTED: 'publish_rejected',
} as const;

export const COMPETITION_ROOMS = {
  competition: (competitionId: string) => `competition:${competitionId}`,
  round: (roundId: string) => `round:${roundId}`,
} as const;
