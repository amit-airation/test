import { Injectable } from '@nestjs/common';
import type { Competition } from '../../../generated/prisma/client.js';

@Injectable()
export class CompetitionTimerService {
  now(): Date {
    return new Date();
  }

  computeWindow(durationSeconds: number, startAt: Date = this.now()) {
    const actualStartAt = startAt;
    const endAt = new Date(actualStartAt.getTime() + durationSeconds * 1000);
    return { actualStartAt, endAt };
  }

  remainingSeconds(endAt: Date | null | undefined, now: Date = this.now()) {
    if (!endAt) {
      return null;
    }
    return Math.max(0, Math.ceil((endAt.getTime() - now.getTime()) / 1000));
  }

  isWithinWindow(
    competition: Pick<Competition, 'status' | 'actualStartAt' | 'endAt'>,
    now: Date = this.now(),
  ) {
    if (competition.status !== 'LIVE') {
      return false;
    }
    if (!competition.actualStartAt || !competition.endAt) {
      return false;
    }
    return (
      now.getTime() >= competition.actualStartAt.getTime() &&
      now.getTime() < competition.endAt.getTime()
    );
  }

  buildSnapshot(
    competition: Pick<
      Competition,
      'id' | 'status' | 'actualStartAt' | 'endAt' | 'durationSeconds'
    >,
  ) {
    const serverTime = this.now();
    return {
      competition_id: competition.id,
      status: competition.status,
      server_time: serverTime.toISOString(),
      start_at: competition.actualStartAt?.toISOString() ?? null,
      end_at: competition.endAt?.toISOString() ?? null,
      duration_seconds: competition.durationSeconds,
      time_remaining_seconds: this.remainingSeconds(
        competition.endAt,
        serverTime,
      ),
    };
  }
}
