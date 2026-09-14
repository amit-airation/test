import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { CompetitionEventType } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { CompetitionPublishContext } from '../validators/competition-job.validator/competition-job.validator.js';

export type ScorePublishResult = {
  scored: boolean;
  finalScore: number;
  scoreReachedAt: Date | null;
  participantId: string;
};

@Injectable()
export class CompetitionScoringService {
  private readonly logger = new Logger(CompetitionScoringService.name);

  constructor(private readonly prisma: PrismaService) {}

  async countPublishedJobs(competitionId: string, userId: string) {
    return this.prisma.job.count({
      where: {
        competitionId,
        createdById: userId,
        status: 'PUBLISHED',
        publishedAt: { not: null },
      },
    });
  }

  /**
   * Atomically records that a competition job was scored exactly once.
   * Must run inside the same transaction that publishes the job.
   */
  async recordSuccessfulPublish(
    tx: Prisma.TransactionClient,
    ctx: CompetitionPublishContext,
    jobId: string,
    extraMetadata: Record<string, unknown> = {},
  ): Promise<ScorePublishResult> {
    try {
      await tx.competitionJobScore.create({
        data: {
          competitionId: ctx.competition.id,
          participantId: ctx.participant.id,
          jobId,
        },
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        // Retry / already scored this job — no second increment.
        const participant = await tx.competitionParticipant.findUniqueOrThrow({
          where: { id: ctx.participant.id },
        });
        this.logger.log({
          event: 'score_idempotent_skip',
          competition_id: ctx.competition.id,
          participant_id: ctx.participant.id,
          job_id: jobId,
          final_score: participant.finalScore,
        });
        return {
          scored: false,
          finalScore: participant.finalScore,
          scoreReachedAt: participant.scoreReachedAt,
          participantId: participant.id,
        };
      }
      throw error;
    }

    const reachedAt = ctx.now;
    const participant = await tx.competitionParticipant.update({
      where: { id: ctx.participant.id },
      data: {
        finalScore: { increment: 1 },
        scoreReachedAt: reachedAt,
      },
    });

    await tx.competitionEvent.create({
      data: {
        competitionId: ctx.competition.id,
        participantId: ctx.participant.id,
        eventType: CompetitionEventType.JOB_PUBLISHED,
        metadata: {
          jobId,
          finalScore: participant.finalScore,
          publishedAt: reachedAt.toISOString(),
          ...extraMetadata,
        },
      },
    });

    await tx.job.update({
      where: { id: jobId },
      data: { scoredAt: reachedAt },
    });

    this.logger.log({
      event: 'score_updated',
      competition_id: ctx.competition.id,
      participant_id: ctx.participant.id,
      job_id: jobId,
      final_score: participant.finalScore,
    });

    return {
      scored: true,
      finalScore: participant.finalScore,
      scoreReachedAt: participant.scoreReachedAt,
      participantId: participant.id,
    };
  }

  /**
   * Reverses a previously scored job. Floor is zero. No-op if the job
   * was never on the ledger. Must run inside the same transaction that
   * archives the mirrored job.
   */
  async recordUnpublish(
    tx: Prisma.TransactionClient,
    ctx: CompetitionPublishContext,
    jobId: string,
    extraMetadata: Record<string, unknown> = {},
  ): Promise<ScorePublishResult> {
    const deleted = await tx.competitionJobScore.deleteMany({
      where: { jobId },
    });

    if (deleted.count === 0) {
      const participant = await tx.competitionParticipant.findUniqueOrThrow({
        where: { id: ctx.participant.id },
      });
      return {
        scored: false,
        finalScore: participant.finalScore,
        scoreReachedAt: participant.scoreReachedAt,
        participantId: participant.id,
      };
    }

    let participant = await tx.competitionParticipant.update({
      where: { id: ctx.participant.id },
      data: {
        finalScore: { decrement: 1 },
      },
    });

    if (participant.finalScore < 0) {
      participant = await tx.competitionParticipant.update({
        where: { id: ctx.participant.id },
        data: { finalScore: 0 },
      });
    }

    await tx.competitionEvent.create({
      data: {
        competitionId: ctx.competition.id,
        participantId: ctx.participant.id,
        eventType: CompetitionEventType.JOB_UNPUBLISHED,
        metadata: {
          jobId,
          finalScore: participant.finalScore,
          ...extraMetadata,
        },
      },
    });

    this.logger.log({
      event: 'score_reversed',
      competition_id: ctx.competition.id,
      participant_id: ctx.participant.id,
      job_id: jobId,
      final_score: participant.finalScore,
    });

    return {
      scored: true,
      finalScore: participant.finalScore,
      scoreReachedAt: participant.scoreReachedAt,
      participantId: participant.id,
    };
  }

  /**
   * Reconcile denormalized score against published competition jobs.
   * Admin/ops helper — not used on the hot path.
   */
  async reconcileParticipantScore(competitionId: string, userId: string) {
    const participant = await this.prisma.competitionParticipant.findUnique({
      where: {
        competitionId_userId: { competitionId, userId },
      },
    });
    if (!participant) {
      throw new ConflictException('Participant not found');
    }

    const count = await this.countPublishedJobs(competitionId, userId);
    return this.prisma.competitionParticipant.update({
      where: { id: participant.id },
      data: { finalScore: count },
    });
  }
}
