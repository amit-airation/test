import { CompetitionMetricsService } from './competition-metrics.service.js';

describe('CompetitionMetricsService', () => {
  it('tracks websocket, publish, and latency counters', () => {
    const metrics = new CompetitionMetricsService();
    metrics.recordWebsocketConnected();
    metrics.recordWebsocketConnected();
    metrics.recordWebsocketDisconnected();
    metrics.recordWebsocketJoin(true);
    metrics.recordWebsocketJoin(false);
    metrics.recordPublish(true);
    metrics.recordPublish(false);
    metrics.recordLeaderboardLatency(12);
    metrics.recordScoreBroadcast(8);
    metrics.recordScoreBroadcast(0, true);

    const snap = metrics.snapshot();
    expect(snap.websocket.connections).toBe(1);
    expect(snap.websocket.joins).toBe(1);
    expect(snap.websocket.join_failures).toBe(1);
    expect(snap.publish.success).toBe(1);
    expect(snap.publish.failures).toBe(1);
    expect(snap.realtime.score_broadcasts).toBe(1);
    expect(snap.realtime.emit_failures).toBe(1);
    expect(snap.leaderboard.latency_ms.count).toBe(1);
    expect(snap.alerts.realtime_emit_failures).toBe(true);
  });
});
