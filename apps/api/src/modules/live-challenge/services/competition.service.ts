import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CompetitionEventType,
  CompetitionStatus,
} from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { WS_EVENTS } from '../ws-events.js';
import { CompetitionRealtimeService } from './competition-realtime.service.js';
import { RoundLeaderboardService } from './round-leaderboard.service.js';
import { RoundTimerService } from './round-timer.service.js';

@Injectable()
export class CompetitionService {
  private readonly logger = new Logger(CompetitionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: CompetitionRealtimeService,
    private readonly leaderboard: RoundLeaderboardService,
    private readonly timer: RoundTimerService,
  ) {}

  async create(dto: { name: string; description?: string }) {
    const competition = await this.prisma.$transaction(async (tx) => {
      const created = await tx.competition.create({
        data: {
          name: dto.name,
          description: dto.description,
          status: CompetitionStatus.DRAFT,
        },
      });
      await tx.competitionEvent.create({
        data: {
          competitionId: created.id,
          eventType: CompetitionEventType.CREATED,
        },
      });
      return created;
    });

    this.logger.log({
      event: 'competition_created',
      competition_id: competition.id,
    });
    return competition;
  }

  async findOne(competitionId: string) {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
      include: {
        rounds: {
          orderBy: { roundNumber: 'asc' },
          select: {
            id: true,
            roundNumber: true,
            name: true,
            status: true,
            durationSeconds: true,
            actualStartAt: true,
            endAt: true,
            finalizedAt: true,
            winnerCompanyId: true,
            _count: { select: { participants: true } },
          },
        },
      },
    });
    if (!competition)
      throw new NotFoundException(`Competition ${competitionId} not found`);

    return competition;
  }

  async cancel(competitionId: string) {
    await this.requireCompetition(competitionId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.competition.update({
        where: { id: competitionId },
        data: { status: CompetitionStatus.CANCELLED },
      });
      await tx.competitionEvent.create({
        data: {
          competitionId,
          eventType: CompetitionEventType.CANCELLED,
        },
      });
      return result;
    });

    this.logger.log({
      event: 'competition_cancelled',
      competition_id: competitionId,
    });
    return updated;
  }

  /**
   * Admin sets which round observers see on the live display.
   * Emits ACTIVE_ROUND_CHANGED to all clients in the competition room.
   */
  async setActiveRound(competitionId: string, roundId: string | null) {
    await this.requireCompetition(competitionId);

    if (roundId) {
      const round = await this.prisma.round.findUnique({
        where: { id: roundId },
      });
      if (!round || round.competitionId !== competitionId) {
        throw new BadRequestException(
          `Round ${roundId} does not belong to competition ${competitionId}`,
        );
      }
    }

    const updated = await this.prisma.competition.update({
      where: { id: competitionId },
      data: { activeRoundId: roundId },
    });

    // Build the round payload for the WS event
    let roundPayload: {
      id: string;
      name: string | null;
      round_number: number;
      status: string;
      timer: ReturnType<RoundTimerService['buildSnapshot']> | null;
    } | null = null;

    if (roundId) {
      const round = await this.prisma.round.findUnique({
        where: { id: roundId },
      });
      if (round) {
        roundPayload = {
          id: round.id,
          name: round.name,
          round_number: round.roundNumber,
          status: round.status,
          timer: this.timer.buildSnapshot(round),
        };
      }
    }

    this.realtime.emitActiveRoundChanged({
      event: WS_EVENTS.ACTIVE_ROUND_CHANGED,
      competition_id: competitionId,
      active_round_id: roundId,
      round: roundPayload,
    });

    this.logger.log({
      event: 'active_round_changed',
      competition_id: competitionId,
      active_round_id: roundId,
    });

    return updated;
  }

  async getLeaderboard(competitionId: string) {
    const competition = await this.requireCompetition(competitionId);
    if (!competition.activeRoundId) {
      throw new BadRequestException(
        'No active round set for this competition',
      );
    }
    return this.leaderboard.getLeaderboard(competition.activeRoundId);
  }

  private async requireCompetition(competitionId: string) {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
    });
    if (!competition)
      throw new NotFoundException(`Competition ${competitionId} not found`);
    return competition;
  }
}
