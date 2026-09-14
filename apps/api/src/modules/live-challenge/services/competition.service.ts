import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CompetitionEventType,
  CompetitionStatus,
  ParticipantStatus,
} from '../../../generated/prisma/client.js';
import { requireExternalUserIdOnJoin } from '../../../config/external-job.config.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { DEFAULT_COMPETITION_DURATION_SECONDS } from '../constants.js';
import { CreateCompetitionDto } from '../dto/create-competition.dto/create-competition.dto.js';
import { JoinCompetitionDto } from '../dto/join-competition.dto/join-competition.dto.js';
import { QueryCompetitionEventsDto } from '../dto/query-competition-events.dto.js';
import { RegisterParticipantDto } from '../dto/register-participant.dto/register-participant.dto.js';
import { ParticipantAlreadyRegisteredException } from '../exceptions.js';
import { WS_EVENTS } from '../ws-events.js';
import { CompetitionAuditService } from './competition-audit.service.js';
import { CompetitionLifecycleService } from './competition-lifecycle.service.js';
import { CompetitionLeaderboardService } from './competition-leaderboard.service.js';
import { CompetitionRealtimeService } from './competition-realtime.service.js';
import { CompetitionTimerService } from './competition-timer.service.js';
import { ScreenShareService } from './screen-share.service.js';

@Injectable()
export class CompetitionService {
  private readonly logger = new Logger(CompetitionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: CompetitionLifecycleService,
    private readonly leaderboard: CompetitionLeaderboardService,
    private readonly timer: CompetitionTimerService,
    private readonly realtime: CompetitionRealtimeService,
    private readonly audit: CompetitionAuditService,
    private readonly screenShare: ScreenShareService,
    private readonly config: ConfigService,
  ) {}

  create(dto: CreateCompetitionDto, createdById: string) {
    return this.prisma.$transaction(async (tx) => {
      const competition = await tx.competition.create({
        data: {
          name: dto.name,
          description: dto.description,
          durationSeconds:
            dto.durationSeconds ?? DEFAULT_COMPETITION_DURATION_SECONDS,
          allowOpenJoin: dto.allowOpenJoin ?? false,
          createdById,
          status: CompetitionStatus.DRAFT,
        },
      });

      await tx.competitionEvent.create({
        data: {
          competitionId: competition.id,
          eventType: CompetitionEventType.CREATED,
          metadata: { createdById },
        },
      });

      this.logger.log({
        event: 'competition_created',
        competition_id: competition.id,
        created_by: createdById,
      });

      return competition;
    });
  }

  async findOne(competitionId: string) {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
      include: {
        _count: { select: { participants: true, jobs: true } },
      },
    });
    if (!competition) {
      throw new NotFoundException(`Competition ${competitionId} not found`);
    }

    return {
      ...competition,
      timer: this.timer.buildSnapshot(competition),
    };
  }

  schedule(competitionId: string, scheduledStartAt: string) {
    return this.lifecycle.schedule(
      competitionId,
      new Date(scheduledStartAt),
    );
  }

  start(competitionId: string) {
    return this.lifecycle.start(competitionId);
  }

  end(competitionId: string) {
    return this.lifecycle.end(competitionId);
  }

  finalize(competitionId: string) {
    return this.lifecycle.finalize(competitionId);
  }

  cancel(competitionId: string) {
    return this.lifecycle.cancel(competitionId);
  }

  async registerParticipant(
    competitionId: string,
    dto: RegisterParticipantDto,
  ) {
    const competition = await this.requireCompetition(competitionId);
    if (
      competition.status === CompetitionStatus.FINALIZED ||
      competition.status === CompetitionStatus.CANCELLED ||
      competition.status === CompetitionStatus.ENDED
    ) {
      throw new BadRequestException(
        'Cannot register participants on a closed competition',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) {
      throw new NotFoundException(`User ${dto.userId} not found`);
    }

    const companyId = await this.resolveCompanyId(dto.userId, dto.companyId);
    await this.linkExternalUserId(dto.userId, dto.externalUserId);
    await this.assertExternalUserIdPresent(dto.userId, dto.externalUserId);

    try {
      const participant = await this.prisma.$transaction(async (tx) => {
        const created = await tx.competitionParticipant.create({
          data: {
            competitionId,
            userId: dto.userId,
            companyId,
            status: ParticipantStatus.REGISTERED,
          },
        });
        await tx.competitionEvent.create({
          data: {
            competitionId,
            participantId: created.id,
            eventType: CompetitionEventType.REGISTERED,
            metadata: { userId: dto.userId, companyId },
          },
        });
        return created;
      });

      this.logger.log({
        event: 'participant_registered',
        competition_id: competitionId,
        participant_id: participant.id,
        user_id: dto.userId,
      });

      return participant;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        throw new ParticipantAlreadyRegisteredException();
      }
      throw error;
    }
  }

  async join(
    competitionId: string,
    userId: string,
    dto: JoinCompetitionDto,
  ) {
    const competition = await this.requireCompetition(competitionId);
    if (
      competition.status !== CompetitionStatus.SCHEDULED &&
      competition.status !== CompetitionStatus.LIVE &&
      competition.status !== CompetitionStatus.DRAFT
    ) {
      throw new BadRequestException(
        'Competition is not open for joining',
      );
    }

    let participant = await this.prisma.competitionParticipant.findUnique({
      where: {
        competitionId_userId: { competitionId, userId },
      },
    });

    if (participant?.status === ParticipantStatus.DISQUALIFIED) {
      throw new ForbiddenException(
        'You have been disqualified from this competition',
      );
    }

    // Closed roster by default: self-service join only where an admin opted in.
    if (!participant && !competition.allowOpenJoin) {
      throw new ForbiddenException(
        'You are not registered for this competition. Ask a competition admin to register you.',
      );
    }

    const companyId = await this.resolveCompanyId(userId, dto.companyId);
    await this.linkExternalUserId(userId, dto.externalUserId);
    await this.assertExternalUserIdPresent(userId, dto.externalUserId);

    if (!participant) {
      participant = await this.prisma.competitionParticipant.create({
        data: {
          competitionId,
          userId,
          companyId,
          status: ParticipantStatus.REGISTERED,
        },
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.competitionParticipant.update({
        where: { id: participant!.id },
        data: {
          joinedAt: participant!.joinedAt ?? new Date(),
          companyId: companyId ?? participant!.companyId,
          status:
            competition.status === CompetitionStatus.LIVE
              ? ParticipantStatus.ACTIVE
              : ParticipantStatus.READY,
          lastHeartbeatAt: new Date(),
        },
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      await tx.competitionEvent.create({
        data: {
          competitionId,
          participantId: result.id,
          eventType: CompetitionEventType.JOINED,
        },
      });

      return result;
    });

    this.logger.log({
      event: 'participant_joined',
      competition_id: competitionId,
      participant_id: updated.id,
      user_id: userId,
    });

    this.realtime.emitPresence(competitionId, WS_EVENTS.PARTICIPANT_JOINED, {
      participant_id: updated.id,
      user_id: userId,
      name: updated.user.name,
      status: updated.status,
    });

    return updated;
  }

  async listParticipants(competitionId: string) {
    await this.requireCompetition(competitionId);
    return this.prisma.competitionParticipant.findMany({
      where: { competitionId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        company: { select: { id: true, name: true } },
      },
      orderBy: [{ finalScore: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async listEvents(
    competitionId: string,
    query: QueryCompetitionEventsDto = {},
  ) {
    await this.requireCompetition(competitionId);
    return this.audit.list(competitionId, query);
  }

  /**
   * Admin-only sanction. Disqualified participants keep their audit trail and
   * recorded score but are blocked from creating or publishing further jobs.
   */
  async disqualifyParticipant(
    competitionId: string,
    participantId: string,
    reason: string,
    actingAdminId: string,
  ) {
    await this.requireCompetition(competitionId);

    const participant = await this.prisma.competitionParticipant.findUnique({
      where: { id: participantId },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!participant || participant.competitionId !== competitionId) {
      throw new NotFoundException(
        `Participant ${participantId} not found in competition ${competitionId}`,
      );
    }
    if (participant.status === ParticipantStatus.DISQUALIFIED) {
      return participant;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.competitionParticipant.update({
        where: { id: participantId },
        data: {
          status: ParticipantStatus.DISQUALIFIED,
          completedAt: new Date(),
        },
        include: { user: { select: { id: true, name: true } } },
      });

      await tx.competitionEvent.create({
        data: {
          competitionId,
          participantId,
          eventType: CompetitionEventType.DISQUALIFIED,
          metadata: { reason, disqualifiedBy: actingAdminId },
        },
      });

      return result;
    });

    this.logger.warn({
      event: 'participant_disqualified',
      competition_id: competitionId,
      participant_id: participantId,
      acting_admin_id: actingAdminId,
    });

    this.realtime.emitPresence(
      competitionId,
      WS_EVENTS.PARTICIPANT_DISQUALIFIED,
      {
        participant_id: participantId,
        user_id: updated.userId,
        name: updated.user.name,
        status: updated.status,
      },
    );
    void this.screenShare.kickPublisher(competitionId, updated.userId);

    return updated;
  }

  recordScreenShareState(
    competitionId: string,
    participantId: string,
    sharing: boolean,
  ) {
    return this.audit.record({
      competitionId,
      participantId,
      eventType: sharing
        ? CompetitionEventType.SCREEN_SHARE_STARTED
        : CompetitionEventType.SCREEN_SHARE_STOPPED,
    });
  }

  async getMe(competitionId: string, userId: string) {
    const competition = await this.requireCompetition(competitionId);
    const participant = await this.prisma.competitionParticipant.findUnique({
      where: {
        competitionId_userId: { competitionId, userId },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            externalUserId: true,
          },
        },
        company: { select: { id: true, name: true } },
      },
    });

    if (!participant) {
      throw new NotFoundException(
        'You are not a participant in this competition',
      );
    }

    const leaderboard = await this.leaderboard.getLeaderboard(competitionId);
    const me = leaderboard.participants.find((p) => p.user_id === userId);

    return {
      competition_id: competitionId,
      status: competition.status,
      timer: this.timer.buildSnapshot(competition),
      my_score: participant.finalScore,
      my_rank: me?.rank ?? participant.finalRank,
      total_participants: leaderboard.participants.length,
      external_user_id: participant.user.externalUserId,
      participant,
    };
  }

  getLeaderboard(competitionId: string) {
    return this.leaderboard.getLeaderboard(competitionId);
  }

  private async requireCompetition(competitionId: string) {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
    });
    if (!competition) {
      throw new NotFoundException(`Competition ${competitionId} not found`);
    }
    return competition;
  }

  private async resolveCompanyId(userId: string, companyId?: string) {
    if (companyId) {
      const membership = await this.prisma.companyMembership.findUnique({
        where: {
          userId_companyId: { userId, companyId },
        },
      });
      if (!membership) {
        throw new BadRequestException(
          'User is not a member of the specified company',
        );
      }
      return companyId;
    }

    const membership = await this.prisma.companyMembership.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return membership?.companyId ?? null;
  }

  private async linkExternalUserId(userId: string, externalUserId?: string) {
    const trimmed = externalUserId?.trim();
    if (!trimmed) {
      return;
    }

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { externalUserId: trimmed },
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          'externalUserId is already linked to another user',
        );
      }
      throw error;
    }
  }

  private async assertExternalUserIdPresent(
    userId: string,
    providedExternalUserId?: string,
  ) {
    if (!requireExternalUserIdOnJoin(this.config)) {
      return;
    }
    if (providedExternalUserId?.trim()) {
      return;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { externalUserId: true },
    });
    if (!user?.externalUserId) {
      throw new BadRequestException(
        'externalUserId is required to join this competition (link your job-server user id)',
      );
    }
  }
}
