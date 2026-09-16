import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CompetitionEventType,
  ParticipantStatus,
  RoundStatus,
} from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { DEFAULT_ROUND_DURATION_SECONDS } from '../constants.js';
import {
  assertValidMobile,
  verifyJoinPin,
} from '../utils/join-pin.js';
import { WS_EVENTS } from '../ws-events.js';
import { CompetitionRealtimeService } from './competition-realtime.service.js';
import { RoundLeaderboardService } from './round-leaderboard.service.js';
import { RoundLifecycleService } from './round-lifecycle.service.js';
import { RoundTimerService } from './round-timer.service.js';
import { ScreenShareService } from './screen-share.service.js';

@Injectable()
export class RoundService {
  private readonly logger = new Logger(RoundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: RoundLifecycleService,
    private readonly leaderboard: RoundLeaderboardService,
    private readonly timer: RoundTimerService,
    private readonly realtime: CompetitionRealtimeService,
    private readonly screenShare: ScreenShareService,
  ) {}

  async create(
    competitionId: string,
    dto: { name?: string; durationSeconds?: number; roundNumber: number },
  ) {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
    });
    if (!competition)
      throw new NotFoundException(`Competition ${competitionId} not found`);

    const round = await this.prisma.$transaction(async (tx) => {
      const created = await tx.round.create({
        data: {
          competitionId,
          roundNumber: dto.roundNumber,
          name: dto.name,
          durationSeconds: dto.durationSeconds ?? DEFAULT_ROUND_DURATION_SECONDS,
          status: RoundStatus.DRAFT,
        },
      });
      await tx.competitionEvent.create({
        data: {
          competitionId,
          roundId: created.id,
          eventType: CompetitionEventType.ROUND_CREATED,
          metadata: { roundNumber: dto.roundNumber },
        },
      });
      return created;
    });

    this.logger.log({
      event: 'round_created',
      competition_id: competitionId,
      round_id: round.id,
    });
    return round;
  }

  findOne(roundId: string) {
    return this.lifecycle.requireRound(roundId);
  }

  findAllForCompetition(competitionId: string) {
    return this.prisma.round.findMany({
      where: { competitionId },
      orderBy: { roundNumber: 'asc' },
      include: { _count: { select: { participants: true } } },
    });
  }

  schedule(roundId: string, scheduledStartAt: string) {
    return this.lifecycle.schedule(roundId, new Date(scheduledStartAt));
  }

  start(roundId: string) {
    return this.lifecycle.start(roundId);
  }

  end(roundId: string) {
    return this.lifecycle.end(roundId);
  }

  finalize(roundId: string) {
    return this.lifecycle.finalize(roundId);
  }

  cancel(roundId: string) {
    return this.lifecycle.cancel(roundId);
  }

  getLeaderboard(roundId: string) {
    return this.leaderboard.getLeaderboard(roundId);
  }

  async listParticipants(roundId: string) {
    await this.lifecycle.requireRound(roundId);
    return this.prisma.roundParticipant.findMany({
      where: { roundId },
      include: {
        company: { select: { id: true, name: true, mobile: true } },
      },
      orderBy: [{ finalScore: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Admin closed-roster registration.
   * Upserts Company (id + name + mobile) and creates RoundParticipant.
   * Does not allow join without a prior register.
   */
  async registerParticipants(
    roundId: string,
    participants: Array<{
      companyId: string;
      companyName: string;
      mobile: string;
    }>,
  ) {
    const round = await this.lifecycle.requireRound(roundId);

    if (
      round.status === RoundStatus.FINALIZED ||
      round.status === RoundStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Cannot register participants for a closed round',
      );
    }

    const results: Array<{
      companyId: string;
      participantId: string;
      mobile: string;
    }> = [];

    for (const p of participants) {
      let mobile: string;
      try {
        mobile = assertValidMobile(p.mobile);
      } catch {
        throw new BadRequestException(
          `Invalid mobile for company ${p.companyId}: must be 10–15 digits`,
        );
      }

      const mobileOwner = await this.prisma.company.findUnique({
        where: { mobile },
      });
      if (mobileOwner && mobileOwner.id !== p.companyId) {
        throw new BadRequestException(
          `Mobile ${mobile} is already registered to another company`,
        );
      }

      await this.prisma.company.upsert({
        where: { id: p.companyId },
        create: { id: p.companyId, name: p.companyName, mobile },
        update: { name: p.companyName, mobile },
      });

      try {
        const participant = await this.prisma.$transaction(async (tx) => {
          const created = await tx.roundParticipant.create({
            data: {
              roundId,
              companyId: p.companyId,
              status: ParticipantStatus.REGISTERED,
            },
          });
          await tx.competitionEvent.create({
            data: {
              competitionId: round.competitionId,
              roundId,
              roundParticipantId: created.id,
              eventType: CompetitionEventType.REGISTERED,
              metadata: {
                companyId: p.companyId,
                companyName: p.companyName,
                mobile,
              },
            },
          });
          return created;
        });
        results.push({
          companyId: p.companyId,
          participantId: participant.id,
          mobile,
        });
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { code: string }).code === 'P2002'
        ) {
          const existing = await this.prisma.roundParticipant.findUnique({
            where: { roundId_companyId: { roundId, companyId: p.companyId } },
          });
          if (existing) {
            results.push({
              companyId: p.companyId,
              participantId: existing.id,
              mobile,
            });
          }
        } else {
          throw error;
        }
      }
    }

    this.logger.log({
      event: 'participants_registered',
      round_id: roundId,
      count: results.length,
    });

    return { registered: results.length, participants: results };
  }

  /**
   * Closed-roster join: mobile + competition PIN.
   * Company must already be registered for the round.
   */
  async join(roundId: string, dto: { mobile: string; password: string }) {
    const round = await this.lifecycle.requireRound(roundId);

    if (
      round.status !== RoundStatus.SCHEDULED &&
      round.status !== RoundStatus.LIVE &&
      round.status !== RoundStatus.DRAFT
    ) {
      throw new BadRequestException('Round is not open for joining');
    }

    let mobile: string;
    try {
      mobile = assertValidMobile(dto.mobile);
    } catch {
      throw new BadRequestException('Mobile must be 10–15 digits');
    }

    const competition = await this.prisma.competition.findUnique({
      where: { id: round.competitionId },
    });
    if (!competition) {
      throw new NotFoundException(
        `Competition ${round.competitionId} not found`,
      );
    }

    if (!verifyJoinPin(dto.password, competition.joinPinHash)) {
      throw new UnauthorizedException('Invalid join password');
    }

    const company = await this.prisma.company.findUnique({
      where: { mobile },
    });
    if (!company) {
      throw new NotFoundException(
        'This mobile is not registered for the competition',
      );
    }

    const participant = await this.prisma.roundParticipant.findUnique({
      where: {
        roundId_companyId: { roundId, companyId: company.id },
      },
      include: {
        company: { select: { id: true, name: true, mobile: true } },
      },
    });

    if (!participant) {
      throw new ForbiddenException(
        'You are not on the roster for this round. Ask the admin to register your company.',
      );
    }

    if (participant.status === ParticipantStatus.DISQUALIFIED) {
      throw new ForbiddenException(
        'This company has been disqualified from this round',
      );
    }

    const updated = await this.prisma.roundParticipant.update({
      where: { id: participant.id },
      data: {
        joinedAt: participant.joinedAt ?? new Date(),
        status:
          round.status === RoundStatus.LIVE
            ? ParticipantStatus.ACTIVE
            : ParticipantStatus.READY,
      },
      include: {
        company: { select: { id: true, name: true, mobile: true } },
      },
    });

    if (!participant.joinedAt) {
      await this.prisma.competitionEvent.create({
        data: {
          competitionId: round.competitionId,
          roundId,
          roundParticipantId: updated.id,
          eventType: CompetitionEventType.JOINED,
          metadata: { mobile, companyId: company.id },
        },
      });
    }

    this.realtime.emitPresence(round.competitionId, WS_EVENTS.PARTICIPANT_JOINED, {
      round_id: roundId,
      participant_id: updated.id,
      company_id: company.id,
      company_name: company.name,
      status: updated.status,
    });

    return {
      id: updated.id,
      roundId: updated.roundId,
      companyId: updated.companyId,
      companyName: updated.company.name,
      mobile: updated.company.mobile,
      status: updated.status,
      joinedAt: updated.joinedAt,
      finalScore: updated.finalScore,
      finalRank: updated.finalRank,
    };
  }

  async getMe(roundId: string, companyId: string) {
    const round = await this.lifecycle.requireRound(roundId);

    const participant = await this.prisma.roundParticipant.findUnique({
      where: { roundId_companyId: { roundId, companyId } },
      include: {
        company: { select: { id: true, name: true, mobile: true } },
      },
    });
    if (!participant) {
      throw new NotFoundException(
        'You are not registered for this round',
      );
    }

    // Compute rank from current leaderboard order
    const allParticipants = await this.prisma.roundParticipant.findMany({
      where: { roundId },
      orderBy: [
        { finalScore: 'desc' },
        { scoreReachedAt: 'asc' },
        { createdAt: 'asc' },
      ],
      select: { id: true },
    });
    const rankIndex = allParticipants.findIndex((p) => p.id === participant.id);
    const myRank =
      participant.finalRank ??
      (rankIndex >= 0 ? rankIndex + 1 : null);

    return {
      round_id: roundId,
      competition_id: round.competitionId,
      status: round.status,
      my_score: participant.finalScore,
      my_rank: myRank,
      timer: this.timer.buildSnapshot(round),
      participant: {
        id: participant.id,
        status: participant.status,
        company_id: participant.companyId,
        company_name: participant.company.name,
        mobile: participant.company.mobile,
        last_scored_at: participant.lastScoredAt?.toISOString() ?? null,
      },
    };
  }

  async disqualifyParticipant(
    roundId: string,
    participantId: string,
    reason: string,
  ) {
    const round = await this.lifecycle.requireRound(roundId);

    const participant = await this.prisma.roundParticipant.findUnique({
      where: { id: participantId },
      include: { company: { select: { id: true, name: true } } },
    });
    if (!participant || participant.roundId !== roundId) {
      throw new NotFoundException(
        `Participant ${participantId} not found in round ${roundId}`,
      );
    }
    if (participant.status === ParticipantStatus.DISQUALIFIED) {
      return participant;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.roundParticipant.update({
        where: { id: participantId },
        data: {
          status: ParticipantStatus.DISQUALIFIED,
          completedAt: new Date(),
        },
        include: { company: { select: { id: true, name: true } } },
      });
      await tx.competitionEvent.create({
        data: {
          competitionId: round.competitionId,
          roundId,
          roundParticipantId: participantId,
          eventType: CompetitionEventType.DISQUALIFIED,
          metadata: { reason },
        },
      });
      return result;
    });

    this.realtime.emitPresence(
      round.competitionId,
      WS_EVENTS.PARTICIPANT_DISQUALIFIED,
      {
        round_id: roundId,
        participant_id: participantId,
        company_id: updated.companyId,
        company_name: updated.company.name,
        status: updated.status,
      },
    );
    void this.screenShare.kickPublisher(roundId, updated.companyId);

    return updated;
  }

  screenShareStatus() {
    return this.screenShare.getStatus();
  }

  issueScreenShareToken(
    roundId: string,
    companyId: string | null,
    companyName: string,
    intent: 'publish' | 'watch',
  ) {
    return this.screenShare.issueToken(roundId, companyId, companyName, intent);
  }
}
