import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CompetitionEventType,
  ParticipantStatus,
  RoundStatus,
} from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { InvalidRoundTransitionException } from '../exceptions.js';
import { WS_EVENTS } from '../ws-events.js';
import { CompetitionRealtimeService } from './competition-realtime.service.js';
import { RoundTimerService } from './round-timer.service.js';
import { ScreenShareService } from './screen-share.service.js';

const ALLOWED_TRANSITIONS: Record<RoundStatus, RoundStatus[]> = {
  [RoundStatus.DRAFT]: [
    RoundStatus.SCHEDULED,
    RoundStatus.LIVE,
    RoundStatus.CANCELLED,
  ],
  [RoundStatus.SCHEDULED]: [RoundStatus.LIVE, RoundStatus.CANCELLED],
  [RoundStatus.LIVE]: [RoundStatus.ENDED, RoundStatus.CANCELLED],
  [RoundStatus.ENDED]: [RoundStatus.FINALIZED],
  [RoundStatus.FINALIZED]: [],
  [RoundStatus.CANCELLED]: [],
};

@Injectable()
export class RoundLifecycleService {
  private readonly logger = new Logger(RoundLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timer: RoundTimerService,
    private readonly realtime: CompetitionRealtimeService,
    private readonly screenShare: ScreenShareService,
  ) {}

  assertTransition(from: RoundStatus, to: RoundStatus) {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new InvalidRoundTransitionException(from, to);
    }
  }

  async schedule(roundId: string, scheduledStartAt: Date) {
    const round = await this.requireRound(roundId);
    this.assertTransition(round.status, RoundStatus.SCHEDULED);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.round.update({
        where: { id: roundId },
        data: { status: RoundStatus.SCHEDULED, scheduledStartAt },
      });
      await tx.competitionEvent.create({
        data: {
          competitionId: round.competitionId,
          roundId,
          eventType: CompetitionEventType.ROUND_SCHEDULED,
          metadata: { scheduledStartAt: scheduledStartAt.toISOString() },
        },
      });
      return updated;
    });
  }

  async start(roundId: string) {
    const round = await this.requireRound(roundId);
    this.assertTransition(round.status, RoundStatus.LIVE);

    const otherLive = await this.prisma.round.findFirst({
      where: {
        competitionId: round.competitionId,
        status: RoundStatus.LIVE,
        id: { not: roundId },
      },
      select: { id: true, roundNumber: true },
    });
    if (otherLive) {
      throw new ConflictException(
        `Round ${otherLive.roundNumber} is already LIVE. End or finalize it before starting another round.`,
      );
    }

    const { actualStartAt, endAt } = this.timer.computeWindow(
      round.durationSeconds,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.round.update({
        where: { id: roundId },
        data: { status: RoundStatus.LIVE, actualStartAt, endAt },
      });

      await tx.competition.update({
        where: { id: round.competitionId },
        data: { activeRoundId: roundId },
      });

      await tx.roundParticipant.updateMany({
        where: {
          roundId,
          status: {
            in: [ParticipantStatus.REGISTERED, ParticipantStatus.READY],
          },
        },
        data: { status: ParticipantStatus.ACTIVE },
      });

      await tx.competitionEvent.create({
        data: {
          competitionId: round.competitionId,
          roundId,
          eventType: CompetitionEventType.ROUND_STARTED,
          metadata: {
            actualStartAt: actualStartAt.toISOString(),
            endAt: endAt.toISOString(),
          },
        },
      });

      return result;
    });

    const timer = this.timer.buildSnapshot(updated);
    this.realtime.emitRoundLifecycle({
      event: WS_EVENTS.ROUND_STARTED,
      competition_id: round.competitionId,
      round_id: roundId,
      round_number: round.roundNumber,
      status: updated.status,
      timer,
    });
    this.realtime.emitActiveRoundChanged({
      event: WS_EVENTS.ACTIVE_ROUND_CHANGED,
      competition_id: round.competitionId,
      active_round_id: roundId,
      round: {
        id: updated.id,
        name: updated.name,
        round_number: updated.roundNumber,
        status: updated.status,
        timer,
      },
    });

    this.logger.log({
      event: 'round_started',
      round_id: roundId,
      end_at: endAt.toISOString(),
    });
    return { ...updated, timer };
  }

  async end(roundId: string) {
    const round = await this.requireRound(roundId);
    this.assertTransition(round.status, RoundStatus.ENDED);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.round.update({
        where: { id: roundId },
        data: {
          status: RoundStatus.ENDED,
          endAt: round.endAt ?? new Date(),
        },
      });

      await tx.roundParticipant.updateMany({
        where: {
          roundId,
          status: {
            in: [
              ParticipantStatus.ACTIVE,
              ParticipantStatus.DISCONNECTED,
              ParticipantStatus.READY,
            ],
          },
        },
        data: { status: ParticipantStatus.FINISHED, completedAt: new Date() },
      });

      await tx.competitionEvent.create({
        data: {
          competitionId: round.competitionId,
          roundId,
          eventType: CompetitionEventType.ROUND_ENDED,
        },
      });

      return result;
    });

    this.realtime.emitRoundLifecycle({
      event: WS_EVENTS.ROUND_ENDED,
      competition_id: round.competitionId,
      round_id: roundId,
      round_number: round.roundNumber,
      status: updated.status,
      timer: this.timer.buildSnapshot(updated),
    });
    void this.screenShare.closeRoom(roundId);

    this.logger.log({ event: 'round_ended', round_id: roundId });
    return updated;
  }

  async finalize(roundId: string) {
    const round = await this.requireRound(roundId);
    this.assertTransition(round.status, RoundStatus.FINALIZED);

    const updated = await this.prisma.$transaction(async (tx) => {
      const ranked = await tx.roundParticipant.findMany({
        where: { roundId },
        orderBy: [
          { finalScore: 'desc' },
          { scoreReachedAt: 'asc' },
          { createdAt: 'asc' },
        ],
      });

      for (let i = 0; i < ranked.length; i++) {
        await tx.roundParticipant.update({
          where: { id: ranked[i].id },
          data: { finalRank: i + 1 },
        });
      }

      const winner = ranked[0] ?? null;
      const result = await tx.round.update({
        where: { id: roundId },
        data: {
          status: RoundStatus.FINALIZED,
          finalizedAt: new Date(),
          winnerCompanyId: winner?.companyId ?? null,
        },
      });

      await tx.competitionEvent.create({
        data: {
          competitionId: round.competitionId,
          roundId,
          eventType: CompetitionEventType.ROUND_FINALIZED,
          metadata: {
            winnerCompanyId: winner?.companyId ?? null,
            participantCount: ranked.length,
          },
        },
      });

      return result;
    });

    this.realtime.emitRoundLifecycle({
      event: WS_EVENTS.ROUND_FINALIZED,
      competition_id: round.competitionId,
      round_id: roundId,
      round_number: round.roundNumber,
      status: updated.status,
      winner_company_id: updated.winnerCompanyId,
    });
    void this.screenShare.closeRoom(roundId);

    this.logger.log({
      event: 'round_finalized',
      round_id: roundId,
      winner: updated.winnerCompanyId,
    });
    return updated;
  }

  async cancel(roundId: string) {
    const round = await this.requireRound(roundId);
    this.assertTransition(round.status, RoundStatus.CANCELLED);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.round.update({
        where: { id: roundId },
        data: { status: RoundStatus.CANCELLED },
      });
      await tx.competitionEvent.create({
        data: {
          competitionId: round.competitionId,
          roundId,
          eventType: CompetitionEventType.ROUND_CANCELLED,
        },
      });
      return result;
    });

    void this.screenShare.closeRoom(roundId);
    return updated;
  }

  async requireRound(roundId: string) {
    const round = await this.prisma.round.findUnique({
      where: { id: roundId },
    });
    if (!round) throw new NotFoundException(`Round ${roundId} not found`);
    return round;
  }
}
