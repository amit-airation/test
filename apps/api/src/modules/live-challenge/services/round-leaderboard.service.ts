import { Injectable, NotFoundException } from '@nestjs/common';
import { CompetitionMetricsService } from '../../../common/observability/competition-metrics.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { RoundTimerService } from './round-timer.service.js';

@Injectable()
export class RoundLeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timer: RoundTimerService,
    private readonly metrics: CompetitionMetricsService,
  ) {}

  async getLeaderboard(roundId: string) {
    const started = Date.now();

    const round = await this.prisma.round.findUnique({ where: { id: roundId } });
    if (!round) throw new NotFoundException(`Round ${roundId} not found`);

    const participants = await this.prisma.roundParticipant.findMany({
      where: { roundId },
      include: { company: { select: { id: true, name: true } } },
      orderBy: [
        { finalScore: 'desc' },
        { scoreReachedAt: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    this.metrics.recordLeaderboardLatency(Date.now() - started);

    return {
      round_id: roundId,
      competition_id: round.competitionId,
      status: round.status,
      timer: this.timer.buildSnapshot(round),
      participants: participants.map((p, index) => ({
        rank: p.finalRank ?? index + 1,
        company_id: p.company.id,
        display_name: p.displayName,
        score: p.finalScore,
        status: p.status,
      })),
    };
  }
}
