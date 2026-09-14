import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import { CompetitionMetricsService } from '../../../common/observability/competition-metrics.service.js';
import { COMPETITION_ROOMS } from '../constants.js';
import {
  WS_EVENTS,
  type CompetitionLifecyclePayload,
  type LeaderboardUpdatedPayload,
  type ScoreUpdatedPayload,
  type TimerSnapshotPayload,
} from '../ws-events.js';
import { CompetitionLeaderboardService } from './competition-leaderboard.service.js';

@Injectable()
export class CompetitionRealtimeService {
  private readonly logger = new Logger(CompetitionRealtimeService.name);
  private server: Server | null = null;

  constructor(
    private readonly leaderboard: CompetitionLeaderboardService,
    private readonly metrics: CompetitionMetricsService,
  ) {}

  setServer(server: Server) {
    this.server = server;
  }

  private emit(room: string, event: string, payload: unknown) {
    if (!this.server) {
      this.logger.warn({
        event: 'realtime_emit_skipped_no_server',
        room,
        ws_event: event,
      });
      return;
    }
    try {
      this.server.to(room).emit(event, payload);
    } catch (error) {
      // Never let Socket.IO / Redis adapter failures surface to scoring callers.
      this.metrics.recordScoreBroadcast(0, true);
      this.logger.warn({
        event: 'realtime_emit_failed',
        room,
        ws_event: event,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  emitToCompetition(competitionId: string, event: string, payload: unknown) {
    this.emit(COMPETITION_ROOMS.competition(competitionId), event, payload);
  }

  emitToParticipant(
    competitionId: string,
    participantId: string,
    event: string,
    payload: unknown,
  ) {
    this.emit(
      COMPETITION_ROOMS.participant(competitionId, participantId),
      event,
      payload,
    );
  }

  /**
   * Broadcasts after commit. Failures are logged + counted only —
   * they must never roll back or fail the authoritative score write.
   */
  async emitScoreAndLeaderboard(input: {
    competitionId: string;
    participantId: string;
    userId: string;
    name: string;
    score: number;
    previousScore: number;
    jobId: string;
  }) {
    const started = Date.now();
    try {
      const board = await this.leaderboard.getLeaderboard(input.competitionId);
      const entry = board.participants.find((p) => p.user_id === input.userId);
      const rank = entry?.rank ?? null;

      const scorePayload: ScoreUpdatedPayload = {
        event: WS_EVENTS.SCORE_UPDATED,
        competition_id: input.competitionId,
        participant: {
          id: input.participantId,
          user_id: input.userId,
          name: input.name,
        },
        score: input.score,
        previous_score: input.previousScore,
        rank,
        job_id: input.jobId,
      };

      this.emitToCompetition(
        input.competitionId,
        WS_EVENTS.SCORE_UPDATED,
        scorePayload,
      );
      this.emitToCompetition(input.competitionId, WS_EVENTS.JOB_PUBLISHED, {
        event: WS_EVENTS.JOB_PUBLISHED,
        competition_id: input.competitionId,
        job_id: input.jobId,
        participant_id: input.participantId,
        user_id: input.userId,
        score: input.score,
      });

      if (rank != null) {
        this.emitToCompetition(input.competitionId, WS_EVENTS.RANK_CHANGED, {
          event: WS_EVENTS.RANK_CHANGED,
          competition_id: input.competitionId,
          participant_id: input.participantId,
          user_id: input.userId,
          rank,
          score: input.score,
        });
      }

      const leaderboardPayload: LeaderboardUpdatedPayload = {
        event: WS_EVENTS.LEADERBOARD_UPDATED,
        competition_id: input.competitionId,
        status: board.status,
        timer: board.timer as TimerSnapshotPayload,
        participants: board.participants,
      };
      this.emitToCompetition(
        input.competitionId,
        WS_EVENTS.LEADERBOARD_UPDATED,
        leaderboardPayload,
      );

      this.metrics.recordScoreBroadcast(Date.now() - started);
      this.logger.log({
        event: 'realtime_score_broadcast',
        competition_id: input.competitionId,
        participant_id: input.participantId,
        score: input.score,
        rank,
        duration_ms: Date.now() - started,
      });
    } catch (error) {
      this.metrics.recordScoreBroadcast(Date.now() - started, true);
      this.logger.warn({
        event: 'realtime_score_broadcast_failed',
        competition_id: input.competitionId,
        participant_id: input.participantId,
        job_id: input.jobId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  emitLifecycle(payload: CompetitionLifecyclePayload) {
    this.metrics.recordCompetitionEvent();
    this.emitToCompetition(payload.competition_id, payload.event, payload);
  }

  emitPresence(
    competitionId: string,
    event:
      | typeof WS_EVENTS.PARTICIPANT_CONNECTED
      | typeof WS_EVENTS.PARTICIPANT_DISCONNECTED
      | typeof WS_EVENTS.PARTICIPANT_DISQUALIFIED
      | typeof WS_EVENTS.PARTICIPANT_JOINED,
    data: Record<string, unknown>,
  ) {
    this.emitToCompetition(competitionId, event, {
      event,
      competition_id: competitionId,
      ...data,
    });
  }
}
