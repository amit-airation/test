import { describe, expect, it, vi } from 'vitest';
import { RoundStatus } from '../../../generated/prisma/client.js';
import {
  ROUND_GRACE_PERIOD_MS,
  ROUND_START_BUFFER_SECONDS,
} from '../constants.js';
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

  it('offsets actualStartAt by the start buffer', () => {
    const now = new Date('2026-09-16T10:00:00.000Z');
    const window = timer.computeWindow(300, now);
    expect(window.bufferSeconds).toBe(ROUND_START_BUFFER_SECONDS);
    expect(window.actualStartAt.toISOString()).toBe('2026-09-16T10:00:05.000Z');
    expect(window.endAt.toISOString()).toBe('2026-09-16T10:05:05.000Z');
  });

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

  it('rejects scoring before start (during buffer)', () => {
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

  it('buildSnapshot reports countdown phase before actualStartAt', () => {
    const now = new Date('2026-09-16T09:59:57.000Z');
    vi.spyOn(timer, 'now').mockReturnValue(now);
    const snapshot = timer.buildSnapshot({
      id: 'r1',
      status: RoundStatus.LIVE,
      actualStartAt: start,
      endAt: end,
      durationSeconds: 300,
    });
    expect(snapshot.phase).toBe('countdown');
    expect(snapshot.countdown_to_start_seconds).toBe(3);
    expect(snapshot.time_remaining_seconds).toBe(300);
  });

  it('buildSnapshot reports running after actualStartAt', () => {
    const now = new Date('2026-09-16T10:01:00.000Z');
    vi.spyOn(timer, 'now').mockReturnValue(now);
    const snapshot = timer.buildSnapshot({
      id: 'r1',
      status: RoundStatus.LIVE,
      actualStartAt: start,
      endAt: end,
      durationSeconds: 300,
    });
    expect(snapshot.phase).toBe('running');
    expect(snapshot.countdown_to_start_seconds).toBe(0);
    expect(snapshot.time_remaining_seconds).toBe(240);
  });
});
