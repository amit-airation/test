import { describe, expect, it } from 'vitest';
import { RoundStatus } from '../../../generated/prisma/client.js';
import { ROUND_GRACE_PERIOD_MS } from '../constants.js';
import { RoundTimerService } from './round-timer.service.js';

describe('RoundTimerService', () => {
  const timer = new RoundTimerService();
  const start = new Date('2026-09-16T10:00:00.000Z');
  const end = new Date('2026-09-16T10:05:00.000Z');
  const liveRound = {
    status: RoundStatus.LIVE,
    actualStartAt: start,
    endAt: end,
  };

  it('allows scoring at endAt exactly', () => {
    expect(timer.isWithinScoringWindow(liveRound, end)).toBe(true);
  });

  it('allows scoring within the 3s grace period', () => {
    const withinGrace = new Date(end.getTime() + ROUND_GRACE_PERIOD_MS);
    expect(timer.isWithinScoringWindow(liveRound, withinGrace)).toBe(true);
  });

  it('rejects scoring after endAt + 3s', () => {
    const afterGrace = new Date(end.getTime() + ROUND_GRACE_PERIOD_MS + 1);
    expect(timer.isWithinScoringWindow(liveRound, afterGrace)).toBe(false);
  });

  it('rejects scoring before start', () => {
    const before = new Date(start.getTime() - 1);
    expect(timer.isWithinScoringWindow(liveRound, before)).toBe(false);
  });

  it('rejects scoring when round is not LIVE', () => {
    expect(
      timer.isWithinScoringWindow(
        { ...liveRound, status: RoundStatus.ENDED },
        end,
      ),
    ).toBe(false);
  });
});
