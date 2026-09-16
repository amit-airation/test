import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CompetitionEventType,
  CompetitionStatus,
} from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { WS_EVENTS } from '../ws-events.js';
import {
  hashDefaultJoinPin,
  hashJoinPin,
  verifyJoinPin,
} from '../utils/join-pin.js';
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
      const existing = await tx.competition.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(
          'Only one competition is allowed. Use the existing competition and create rounds on it.',
        );
      }

      const created = await tx.competition.create({
        data: {
          name: dto.name,
          description: dto.description,
          status: CompetitionStatus.DRAFT,
          joinPinHash: hashDefaultJoinPin(),
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
    return this.toPublicCompetition(competition);
  }

  async findAll() {
    const competitions = await this.prisma.competition.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { rounds: true } },
      },
    });

    return competitions.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      status: c.status,
      activeRoundId: c.activeRoundId,
      joinPinSet: Boolean(c.joinPinHash),
      roundCount: c._count.rounds,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  /** Singleton competition for participant home / join routing. */
  async findCurrent() {
    const competition = await this.prisma.competition.findFirst({
      orderBy: { createdAt: 'asc' },
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
    if (!competition) {
      throw new NotFoundException('No competition has been created yet');
    }
    return this.toPublicCompetition(competition);
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

    return this.toPublicCompetition(competition);
  }

  async updateJoinPin(competitionId: string, password: string) {
    await this.requireCompetition(competitionId);
    if (!password || password.length < 4) {
      throw new BadRequestException('Join PIN must be at least 4 characters');
    }

    await this.prisma.competition.update({
      where: { id: competitionId },
      data: { joinPinHash: hashJoinPin(password) },
    });

    this.logger.log({
      event: 'join_pin_updated',
      competition_id: competitionId,
    });

    return { ok: true, joinPinSet: true };
  }

  async verifyJoinPin(competitionId: string, password: string) {
    const competition = await this.requireCompetition(competitionId);
    if (!verifyJoinPin(password, competition.joinPinHash)) {
      throw new UnauthorizedException('Invalid join password');
    }
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
    return this.toPublicCompetition(updated);
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

    return this.toPublicCompetition(updated);
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

  async listEvents(
    competitionId: string,
    query: {
      eventType?: CompetitionEventType;
      participantId?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    await this.requireCompetition(competitionId);

    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;

    const where = {
      competitionId,
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.participantId
        ? { roundParticipantId: query.participantId }
        : {}),
    };

    const [total, events] = await this.prisma.$transaction([
      this.prisma.competitionEvent.count({ where }),
      this.prisma.competitionEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          roundParticipant: {
            select: {
              id: true,
              companyId: true,
              company: { select: { id: true, name: true, mobile: true } },
            },
          },
        },
      }),
    ]);

    return {
      total,
      limit,
      offset,
      events: events.map((e) => ({
        id: e.id,
        competitionId: e.competitionId,
        roundId: e.roundId,
        roundParticipantId: e.roundParticipantId,
        eventType: e.eventType,
        metadata: e.metadata,
        createdAt: e.createdAt,
        participant: e.roundParticipant
          ? {
              id: e.roundParticipant.id,
              companyId: e.roundParticipant.companyId,
              companyName: e.roundParticipant.company.name,
              mobile: e.roundParticipant.company.mobile,
            }
          : null,
      })),
    };
  }

  private toPublicCompetition<
    T extends {
      id: string;
      name: string;
      description: string | null;
      status: CompetitionStatus;
      activeRoundId: string | null;
      joinPinHash?: string;
      createdAt: Date;
      updatedAt: Date;
      rounds?: unknown;
    },
  >(competition: T) {
    const { joinPinHash: _hash, ...rest } = competition;
    return {
      ...rest,
      joinPinSet: Boolean(_hash),
    };
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
