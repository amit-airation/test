import { Injectable } from '@nestjs/common';
import type { Round } from '../../../generated/prisma/client.js';
import { ROUND_GRACE_PERIOD_MS } from '../constants.js';

@Injectable()
export class RoundTimerService {
  now(): Date {
    return new Date();
  }

  computeWindow(durationSeconds: number, startAt: Date = this.now()) {
    const actualStartAt = startAt;
    const endAt = new Date(actualStartAt.getTime() + durationSeconds * 1_000);
    return { actualStartAt, endAt };
  }

  remainingSeconds(endAt: Date | null | undefined, now: Date = this.now()) {
    if (!endAt) return null;
    return Math.max(0, Math.ceil((endAt.getTime() - now.getTime()) / 1_000));
  }

  /** Returns true if now is within the scoring window (round.endAt + grace). */
  isWithinScoringWindow(
    round: Pick<Round, 'status' | 'actualStartAt' | 'endAt'>,
    now: Date,
    graceMs = ROUND_GRACE_PERIOD_MS,
  ) {
    if (round.status !== 'LIVE') return false;
    if (!round.actualStartAt || !round.endAt) return false;
    return (
      now.getTime() >= round.actualStartAt.getTime() &&
      now.getTime() <= round.endAt.getTime() + graceMs
    );
  }

  buildSnapshot(
    round: Pick<Round, 'id' | 'status' | 'actualStartAt' | 'endAt' | 'durationSeconds'>,
  ) {
    const serverTime = this.now();
    return {
      round_id: round.id,
      status: round.status,
      server_time: serverTime.toISOString(),
      start_at: round.actualStartAt?.toISOString() ?? null,
      end_at: round.endAt?.toISOString() ?? null,
      duration_seconds: round.durationSeconds,
      time_remaining_seconds: this.remainingSeconds(round.endAt, serverTime),
    };
  }
}
