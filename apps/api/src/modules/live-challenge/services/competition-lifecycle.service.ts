import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  CompetitionEventType,
  CompetitionStatus,
  ParticipantStatus,
} from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { InvalidCompetitionTransitionException } from '../exceptions.js';
import { WS_EVENTS } from '../ws-events.js';
import { CompetitionRealtimeService } from './competition-realtime.service.js';
import { CompetitionTimerService } from './competition-timer.service.js';
import { ScreenShareService } from './screen-share.service.js';

const ALLOWED_TRANSITIONS: Record<CompetitionStatus, CompetitionStatus[]> = {
  [CompetitionStatus.DRAFT]: [
    CompetitionStatus.SCHEDULED,
    CompetitionStatus.CANCELLED,
  ],
  [CompetitionStatus.SCHEDULED]: [
    CompetitionStatus.LIVE,
    CompetitionStatus.CANCELLED,
  ],
  [CompetitionStatus.LIVE]: [
    CompetitionStatus.ENDED,
    CompetitionStatus.CANCELLED,
  ],
  [CompetitionStatus.ENDED]: [CompetitionStatus.FINALIZED],
  [CompetitionStatus.FINALIZED]: [],
  [CompetitionStatus.CANCELLED]: [],
};

@Injectable()
export class CompetitionLifecycleService {
  private readonly logger = new Logger(CompetitionLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timer: CompetitionTimerService,
    private readonly realtime: CompetitionRealtimeService,
    private readonly screenShare: ScreenShareService,
  ) {}

  assertTransition(from: CompetitionStatus, to: CompetitionStatus) {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new InvalidCompetitionTransitionException(from, to);
    }
  }

  async schedule(competitionId: string, scheduledStartAt: Date) {
    const competition = await this.requireCompetition(competitionId);
    this.assertTransition(competition.status, CompetitionStatus.SCHEDULED);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.competition.update({
        where: { id: competitionId },
        data: {
          status: CompetitionStatus.SCHEDULED,
          scheduledStartAt,
        },
      });
      await tx.competitionEvent.create({
        data: {
          competitionId,
          eventType: CompetitionEventType.SCHEDULED,
          metadata: { scheduledStartAt: scheduledStartAt.toISOString() },
        },
      });
      return result;
    });

    this.logger.log({
      event: 'competition_scheduled',
      competition_id: competitionId,
      status: updated.status,
    });
    return updated;
  }

  async start(competitionId: string) {
    const competition = await this.requireCompetition(competitionId);
    this.assertTransition(competition.status, CompetitionStatus.LIVE);

    const { actualStartAt, endAt } = this.timer.computeWindow(
      competition.durationSeconds,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.competition.update({
        where: { id: competitionId },
        data: {
          status: CompetitionStatus.LIVE,
          actualStartAt,
          endAt,
        },
      });

      await tx.competitionParticipant.updateMany({
        where: {
          competitionId,
          status: {
            in: [ParticipantStatus.REGISTERED, ParticipantStatus.READY],
          },
        },
        data: { status: ParticipantStatus.ACTIVE },
      });

      await tx.competitionEvent.create({
        data: {
          competitionId,
          eventType: CompetitionEventType.STARTED,
          metadata: {
            actualStartAt: actualStartAt.toISOString(),
            endAt: endAt.toISOString(),
          },
        },
      });

      return result;
    });

    this.logger.log({
      event: 'competition_started',
      competition_id: competitionId,
      status: updated.status,
      end_at: endAt.toISOString(),
    });

    const timerSnapshot = this.timer.buildSnapshot(updated);
    this.realtime.emitLifecycle({
      event: WS_EVENTS.COMPETITION_STARTED,
      competition_id: competitionId,
      status: updated.status,
      timer: timerSnapshot,
    });

    return {
      ...updated,
      timer: timerSnapshot,
    };
  }

  async end(competitionId: string) {
    const competition = await this.requireCompetition(competitionId);
    this.assertTransition(competition.status, CompetitionStatus.ENDED);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.competition.update({
        where: { id: competitionId },
        data: {
          status: CompetitionStatus.ENDED,
          endAt: competition.endAt ?? new Date(),
        },
      });

      await tx.competitionParticipant.updateMany({
        where: {
          competitionId,
          status: {
            in: [
              ParticipantStatus.ACTIVE,
              ParticipantStatus.DISCONNECTED,
              ParticipantStatus.READY,
            ],
          },
        },
        data: {
          status: ParticipantStatus.FINISHED,
          completedAt: new Date(),
        },
      });

      await tx.competitionEvent.create({
        data: {
          competitionId,
          eventType: CompetitionEventType.COMPETITION_ENDED,
        },
      });

      return result;
    });

    this.logger.log({
      event: 'competition_ended',
      competition_id: competitionId,
      status: updated.status,
    });

    this.realtime.emitLifecycle({
      event: WS_EVENTS.COMPETITION_ENDED,
      competition_id: competitionId,
      status: updated.status,
      timer: this.timer.buildSnapshot(updated),
    });
    void this.screenShare.closeRoom(competitionId);

    return updated;
  }

  async finalize(competitionId: string) {
    const competition = await this.requireCompetition(competitionId);
    this.assertTransition(competition.status, CompetitionStatus.FINALIZED);

    const updated = await this.prisma.$transaction(async (tx) => {
      const ranked = await tx.competitionParticipant.findMany({
        where: { competitionId },
        orderBy: [
          { finalScore: 'desc' },
          { scoreReachedAt: 'asc' },
          { createdAt: 'asc' },
        ],
      });

      for (let i = 0; i < ranked.length; i += 1) {
        await tx.competitionParticipant.update({
          where: { id: ranked[i].id },
          data: { finalRank: i + 1 },
        });
      }

      const winner = ranked[0] ?? null;
      const result = await tx.competition.update({
        where: { id: competitionId },
        data: {
          status: CompetitionStatus.FINALIZED,
          finalizedAt: new Date(),
          winnerUserId: winner?.userId ?? null,
        },
      });

      await tx.competitionEvent.create({
        data: {
          competitionId,
          eventType: CompetitionEventType.FINALIZED,
          metadata: {
            winnerUserId: winner?.userId ?? null,
            participantCount: ranked.length,
          },
        },
      });

      return result;
    });

    this.logger.log({
      event: 'competition_finalized',
      competition_id: competitionId,
      winner_user_id: updated.winnerUserId,
    });

    this.realtime.emitLifecycle({
      event: WS_EVENTS.COMPETITION_FINALIZED,
      competition_id: competitionId,
      status: updated.status,
      winner_user_id: updated.winnerUserId,
      timer: this.timer.buildSnapshot(updated),
    });
    void this.screenShare.closeRoom(competitionId);

    return updated;
  }

  async cancel(competitionId: string) {
    const competition = await this.requireCompetition(competitionId);
    this.assertTransition(competition.status, CompetitionStatus.CANCELLED);

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
    void this.screenShare.closeRoom(competitionId);
    return updated;
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
}
