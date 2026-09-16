import type { Prisma } from '../../../generated/prisma/client.js';

/**
 * Leaderboard ranking (SSOT for leaderboard, finalize, getMe).
 * 1. Highest finalScore — most scored jobs wins
 * 2. Earliest scoreReachedAt (nulls last) — earlier time of reaching that score
 * 3. createdAt ASC — deterministic final tie-break
 */
export const ROUND_PARTICIPANT_RANK_ORDER = [
  { finalScore: 'desc' },
  { scoreReachedAt: { sort: 'asc', nulls: 'last' } },
  { createdAt: 'asc' },
] as const satisfies Prisma.RoundParticipantOrderByWithRelationInput[];
