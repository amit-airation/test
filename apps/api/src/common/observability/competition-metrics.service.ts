import { Injectable } from '@nestjs/common';

type LatencyBucket = {
  count: number;
  totalMs: number;
  maxMs: number;
};

/**
 * In-process competition metrics (details.md §46 / Phase 8).
 * No Datadog in this repo — expose JSON via /api/metrics and structured logs.
 */
@Injectable()
export class CompetitionMetricsService {
  private readonly startedAt = Date.now();
  private websocketConnections = 0;
  private websocketJoins = 0;
  private websocketJoinFailures = 0;
  private publishSuccess = 0;
  private publishFailures = 0;
  private scoreBroadcasts = 0;
  private realtimeEmitFailures = 0;
  private competitionEvents = 0;
  private readonly leaderboardLatency: LatencyBucket = {
    count: 0,
    totalMs: 0,
    maxMs: 0,
  };
  private readonly scoreBroadcastLatency: LatencyBucket = {
    count: 0,
    totalMs: 0,
    maxMs: 0,
  };

  recordWebsocketConnected() {
    this.websocketConnections += 1;
  }

  recordWebsocketDisconnected() {
    this.websocketConnections = Math.max(0, this.websocketConnections - 1);
  }

  recordWebsocketJoin(ok: boolean) {
    if (ok) this.websocketJoins += 1;
    else this.websocketJoinFailures += 1;
  }

  recordPublish(ok: boolean) {
    if (ok) this.publishSuccess += 1;
    else this.publishFailures += 1;
  }

  recordCompetitionEvent() {
    this.competitionEvents += 1;
  }

  recordLeaderboardLatency(durationMs: number) {
    this.touch(this.leaderboardLatency, durationMs);
  }

  recordScoreBroadcast(durationMs: number, failed = false) {
    if (failed) {
      this.realtimeEmitFailures += 1;
      return;
    }
    this.scoreBroadcasts += 1;
    this.touch(this.scoreBroadcastLatency, durationMs);
  }

  snapshot() {
    return {
      uptime_seconds: Math.floor((Date.now() - this.startedAt) / 1000),
      websocket: {
        connections: this.websocketConnections,
        joins: this.websocketJoins,
        join_failures: this.websocketJoinFailures,
      },
      publish: {
        success: this.publishSuccess,
        failures: this.publishFailures,
      },
      realtime: {
        score_broadcasts: this.scoreBroadcasts,
        emit_failures: this.realtimeEmitFailures,
        score_broadcast_latency_ms: this.summary(this.scoreBroadcastLatency),
      },
      leaderboard: {
        latency_ms: this.summary(this.leaderboardLatency),
      },
      competition_events: this.competitionEvents,
      alerts: this.alertHints(),
    };
  }

  private touch(bucket: LatencyBucket, durationMs: number) {
    const ms = Math.max(0, durationMs);
    bucket.count += 1;
    bucket.totalMs += ms;
    bucket.maxMs = Math.max(bucket.maxMs, ms);
  }

  private summary(bucket: LatencyBucket) {
    return {
      count: bucket.count,
      avg: bucket.count === 0 ? 0 : Math.round(bucket.totalMs / bucket.count),
      max: bucket.maxMs,
    };
  }

  private alertHints() {
    return {
      // Operators should alert when these stay elevated (details.md §46).
      publish_failure_rate_high:
        this.publishFailures > 0 &&
        this.publishFailures / Math.max(1, this.publishSuccess + this.publishFailures) >
          0.05,
      realtime_emit_failures: this.realtimeEmitFailures > 0,
      websocket_join_failures: this.websocketJoinFailures > 10,
    };
  }
}
