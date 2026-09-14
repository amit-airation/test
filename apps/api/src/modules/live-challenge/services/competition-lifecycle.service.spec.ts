import { CompetitionStatus } from '../../../generated/prisma/client.js';
import { InvalidCompetitionTransitionException } from '../exceptions.js';
import { CompetitionLifecycleService } from './competition-lifecycle.service.js';

const ALLOWED: Array<[CompetitionStatus, CompetitionStatus]> = [
  [CompetitionStatus.DRAFT, CompetitionStatus.SCHEDULED],
  [CompetitionStatus.DRAFT, CompetitionStatus.CANCELLED],
  [CompetitionStatus.SCHEDULED, CompetitionStatus.LIVE],
  [CompetitionStatus.SCHEDULED, CompetitionStatus.CANCELLED],
  [CompetitionStatus.LIVE, CompetitionStatus.ENDED],
  [CompetitionStatus.LIVE, CompetitionStatus.CANCELLED],
  [CompetitionStatus.ENDED, CompetitionStatus.FINALIZED],
];

const REJECTED: Array<[CompetitionStatus, CompetitionStatus]> = [
  [CompetitionStatus.DRAFT, CompetitionStatus.LIVE],
  [CompetitionStatus.SCHEDULED, CompetitionStatus.ENDED],
  [CompetitionStatus.LIVE, CompetitionStatus.FINALIZED],
  [CompetitionStatus.ENDED, CompetitionStatus.LIVE],
  [CompetitionStatus.ENDED, CompetitionStatus.CANCELLED],
  // Final results are immutable.
  [CompetitionStatus.FINALIZED, CompetitionStatus.LIVE],
  [CompetitionStatus.FINALIZED, CompetitionStatus.ENDED],
  [CompetitionStatus.FINALIZED, CompetitionStatus.CANCELLED],
  [CompetitionStatus.CANCELLED, CompetitionStatus.LIVE],
  [CompetitionStatus.CANCELLED, CompetitionStatus.SCHEDULED],
];

describe('CompetitionLifecycleService transitions', () => {
  const service = new CompetitionLifecycleService(
    {} as never,
    {} as never,
    {} as never,
    { closeRoom: vi.fn() } as never,
  );

  it.each(ALLOWED)('allows %s -> %s', (from, to) => {
    expect(() => service.assertTransition(from, to)).not.toThrow();
  });

  it.each(REJECTED)('rejects %s -> %s', (from, to) => {
    expect(() => service.assertTransition(from, to)).toThrow(
      InvalidCompetitionTransitionException,
    );
  });
});
