import { Injectable } from '@nestjs/common';
import type { Round } from '../../../generated/prisma/client.js';
import {
  ROUND_GRACE_PERIOD_MS,
  ROUND_START_BUFFER_SECONDS,
} from '../constants.js';

export type TimerPhase = 'idle' | 'countdown' | 'running' | 'ended';

@Injectable()
export class RoundTimerService {
  now(): Date {
    return new Date();
  }

  /**
   * Scoring window starts after the warm-up buffer.
   * endAt = actualStartAt + durationSeconds.
   */
  computeWindow(
    durationSeconds: number,
    now: Date = this.now(),
    bufferSeconds = ROUND_START_BUFFER_SECONDS,
  ) {
    const actualStartAt = new Date(now.getTime() + bufferSeconds * 1_000);
    const endAt = new Date(actualStartAt.getTime() + durationSeconds * 1_000);
    return { actualStartAt, endAt, bufferSeconds };
  }

  remainingSeconds(endAt: Date | null | undefined, now: Date = this.now()) {
    if (!endAt) return null;
    return Math.max(0, Math.ceil((endAt.getTime() - now.getTime()) / 1_000));
  }

  countdownToStartSeconds(
    startAt: Date | null | undefined,
    now: Date = this.now(),
  ) {
    if (!startAt) return null;
    const seconds = Math.ceil((startAt.getTime() - now.getTime()) / 1_000);
    return seconds > 0 ? seconds : 0;
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
    round: Pick<
      Round,
      'id' | 'status' | 'actualStartAt' | 'endAt' | 'durationSeconds'
    >,
  ) {
    const serverTime = this.now();
    const startAt = round.actualStartAt;
    const endAt = round.endAt;

    let phase: TimerPhase = 'idle';
    let countdownToStart: number | null = null;
    let timeRemaining: number | null = null;

    if (round.status === 'LIVE' && startAt && endAt) {
      const nowMs = serverTime.getTime();
      const startMs = startAt.getTime();
      const endMs = endAt.getTime();
      if (nowMs < startMs) {
        phase = 'countdown';
        countdownToStart = Math.max(
          0,
          Math.ceil((startMs - nowMs) / 1_000),
        );
        timeRemaining = round.durationSeconds;
      } else if (nowMs <= endMs) {
        phase = 'running';
        countdownToStart = 0;
        timeRemaining = Math.max(0, Math.ceil((endMs - nowMs) / 1_000));
      } else {
        phase = 'ended';
        countdownToStart = 0;
        timeRemaining = 0;
      }
    } else if (
      round.status === 'ENDED' ||
      round.status === 'FINALIZED'
    ) {
      phase = 'ended';
      countdownToStart = 0;
      timeRemaining = 0;
    }

    return {
      round_id: round.id,
      status: round.status,
      phase,
      server_time: serverTime.toISOString(),
      start_at: startAt?.toISOString() ?? null,
      end_at: endAt?.toISOString() ?? null,
      duration_seconds: round.durationSeconds,
      countdown_to_start_seconds: countdownToStart,
      time_remaining_seconds: timeRemaining,
    };
  }
}
