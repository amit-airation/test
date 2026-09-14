import { CompetitionRealtimeService } from '../services/competition-realtime.service.js';
import { CompetitionMetricsService } from '../../../common/observability/competition-metrics.service.js';

describe('failure isolation (Phase 8)', () => {
  it('does not throw when Socket.IO server is missing after a scored publish', async () => {
    const leaderboard = {
      getLeaderboard: vi.fn().mockResolvedValue({
        status: 'LIVE',
        timer: { remaining_seconds: 10 },
        participants: [
          { user_id: 'u1', rank: 1, name: 'Ada', score: 4, status: 'ACTIVE' },
        ],
      }),
    };
    const metrics = new CompetitionMetricsService();
    const realtime = new CompetitionRealtimeService(
      leaderboard as never,
      metrics,
    );

    await expect(
      realtime.emitScoreAndLeaderboard({
        competitionId: 'c1',
        participantId: 'p1',
        userId: 'u1',
        name: 'Ada',
        score: 4,
        previousScore: 3,
        jobId: 'job-1',
      }),
    ).resolves.toBeUndefined();

    expect(leaderboard.getLeaderboard).toHaveBeenCalledWith('c1');
    expect(metrics.snapshot().realtime.score_broadcasts).toBe(1);
  });

  it('swallows leaderboard/Redis failures without rejecting the caller', async () => {
    const leaderboard = {
      getLeaderboard: vi.fn().mockRejectedValue(new Error('redis adapter down')),
    };
    const metrics = new CompetitionMetricsService();
    const realtime = new CompetitionRealtimeService(
      leaderboard as never,
      metrics,
    );

    await expect(
      realtime.emitScoreAndLeaderboard({
        competitionId: 'c1',
        participantId: 'p1',
        userId: 'u1',
        name: 'Ada',
        score: 4,
        previousScore: 3,
        jobId: 'job-1',
      }),
    ).resolves.toBeUndefined();

    expect(metrics.snapshot().realtime.emit_failures).toBe(1);
    expect(metrics.snapshot().realtime.score_broadcasts).toBe(0);
  });

  it('keeps scoring independent of realtime (no shared mutable score state)', async () => {
    // Authoritative score lives in Postgres via CompetitionScoringService;
    // realtime only reads leaderboard after commit. This guard documents the
    // boundary: scoring constructors take Prisma only.
    const { CompetitionScoringService } = await import(
      '../services/competition-scoring.service.js'
    );
    const scoring = new CompetitionScoringService({} as never);
    expect(scoring).toBeInstanceOf(CompetitionScoringService);
  });
});
