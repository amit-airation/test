import { Injectable, NotFoundException } from '@nestjs/common';
import { CompetitionMetricsService } from '../../../common/observability/competition-metrics.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CompetitionTimerService } from './competition-timer.service.js';

@Injectable()
export class CompetitionLeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timer: CompetitionTimerService,
    private readonly metrics: CompetitionMetricsService,
  ) {}

  async getLeaderboard(competitionId: string) {
    const started = Date.now();
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
    });
    if (!competition) {
      throw new NotFoundException(`Competition ${competitionId} not found`);
    }

    const participants = await this.prisma.competitionParticipant.findMany({
      where: { competitionId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: [
        { finalScore: 'desc' },
        { scoreReachedAt: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    this.metrics.recordLeaderboardLatency(Date.now() - started);

    return {
      competition_id: competitionId,
      status: competition.status,
      timer: this.timer.buildSnapshot(competition),
      participants: participants.map((p, index) => ({
        rank: p.finalRank ?? index + 1,
        user_id: p.user.id,
        name: p.user.name,
        score: p.finalScore,
        status: p.status,
      })),
    };
  }
}
