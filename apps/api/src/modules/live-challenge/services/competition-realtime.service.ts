import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import { CompetitionMetricsService } from '../../../common/observability/competition-metrics.service.js';
import { COMPETITION_ROOMS } from '../constants.js';
import {
  WS_EVENTS,
  type ActiveRoundChangedPayload,
  type LeaderboardUpdatedPayload,
  type RoundLifecyclePayload,
  type ScoreUpdatedPayload,
  type TimerSnapshotPayload,
} from '../ws-events.js';
import { RoundLeaderboardService } from './round-leaderboard.service.js';

@Injectable()
export class CompetitionRealtimeService {
  private readonly logger = new Logger(CompetitionRealtimeService.name);
  private server: Server | null = null;

  constructor(
    private readonly leaderboard: RoundLeaderboardService,
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

  /**
   * Fetches fresh leaderboard and broadcasts all score-related events.
   * Failures are logged only — never roll back the DB write.
   */
  async emitScoreAndLeaderboard(input: {
    competitionId: string;
    roundId: string;
    participantId: string;
    companyId: string;
    displayName: string;
    score: number;
    previousScore: number;
    jobId: string;
    postDurationSeconds: number | null;
  }) {
    const started = Date.now();
    try {
      const board = await this.leaderboard.getLeaderboard(input.roundId);
      const entry = board.participants.find(
        (p) => p.company_id === input.companyId,
      );
      const rank = entry?.rank ?? null;

      const scorePayload: ScoreUpdatedPayload = {
        event: WS_EVENTS.SCORE_UPDATED,
        competition_id: input.competitionId,
        round_id: input.roundId,
        participant: {
          id: input.participantId,
          company_id: input.companyId,
          display_name: input.displayName,
        },
        score: input.score,
        previous_score: input.previousScore,
        rank,
        job_id: input.jobId,
        post_duration_seconds: input.postDurationSeconds,
      };

      this.emitToCompetition(
        input.competitionId,
        WS_EVENTS.SCORE_UPDATED,
        scorePayload,
      );
      this.emitToCompetition(input.competitionId, WS_EVENTS.JOB_PUBLISHED, {
        event: WS_EVENTS.JOB_PUBLISHED,
        competition_id: input.competitionId,
        round_id: input.roundId,
        job_id: input.jobId,
        participant_id: input.participantId,
        company_id: input.companyId,
        display_name: input.displayName,
        score: input.score,
        post_duration_seconds: input.postDurationSeconds,
      });

      if (rank != null) {
        this.emitToCompetition(input.competitionId, WS_EVENTS.RANK_CHANGED, {
          event: WS_EVENTS.RANK_CHANGED,
          competition_id: input.competitionId,
          round_id: input.roundId,
          participant_id: input.participantId,
          company_id: input.companyId,
          rank,
          score: input.score,
        });
      }

      const leaderboardPayload: LeaderboardUpdatedPayload = {
        event: WS_EVENTS.LEADERBOARD_UPDATED,
        competition_id: input.competitionId,
        round_id: input.roundId,
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
    } catch (error) {
      this.metrics.recordScoreBroadcast(Date.now() - started, true);
      this.logger.warn({
        event: 'realtime_score_broadcast_failed',
        competition_id: input.competitionId,
        round_id: input.roundId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  emitRoundLifecycle(payload: RoundLifecyclePayload) {
    this.metrics.recordCompetitionEvent();
    this.emitToCompetition(payload.competition_id, payload.event, payload);
  }

  emitActiveRoundChanged(payload: ActiveRoundChangedPayload) {
    this.emitToCompetition(
      payload.competition_id,
      WS_EVENTS.ACTIVE_ROUND_CHANGED,
      payload,
    );
  }

  emitPresence(
    competitionId: string,
    event: string,
    data: Record<string, unknown>,
  ) {
    this.emitToCompetition(competitionId, event, {
      event,
      competition_id: competitionId,
      ...data,
    });
  }
}
