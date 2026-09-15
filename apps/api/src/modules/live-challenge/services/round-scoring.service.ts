import { Injectable, Logger } from '@nestjs/common';
import type { Prisma, Round, RoundParticipant } from '../../../generated/prisma/client.js';
import { CompetitionEventType } from '../../../generated/prisma/client.js';

export type RoundPublishContext = {
  round: Round;
  participant: RoundParticipant;
  now: Date;
};

export type ScorePublishResult = {
  scored: boolean;
  finalScore: number;
  scoreReachedAt: Date | null;
  participantId: string;
  postDurationSeconds: number | null;
};

@Injectable()
export class RoundScoringService {
  private readonly logger = new Logger(RoundScoringService.name);

  /**
   * Atomically records a scored publish inside the caller's transaction.
   * Idempotent: if jobId already exists in RoundJobScore the call is a no-op.
   * Also computes and stores postDurationSeconds (time since previous scored job).
   */
  async recordSuccessfulPublish(
    tx: Prisma.TransactionClient,
    ctx: RoundPublishContext,
    jobId: string,
    extraMetadata: Record<string, unknown> = {},
  ): Promise<ScorePublishResult> {
    // Idempotency — check before insert to avoid P2002 inside a transaction
    const existingLedger = await tx.roundJobScore.findUnique({
      where: { jobId },
    });
    if (existingLedger) {
      const participant = await tx.roundParticipant.findUniqueOrThrow({
        where: { id: ctx.participant.id },
      });
      this.logger.log({
        event: 'score_idempotent_skip',
        round_id: ctx.round.id,
        participant_id: ctx.participant.id,
        job_id: jobId,
      });
      return {
        scored: false,
        finalScore: participant.finalScore,
        scoreReachedAt: participant.scoreReachedAt,
        participantId: participant.id,
        postDurationSeconds: null,
      };
    }

    // Post duration: elapsed time since this participant's previous scored job
    const lastScore = await tx.roundJobScore.findFirst({
      where: { roundId: ctx.round.id, participantId: ctx.participant.id },
      orderBy: { createdAt: 'desc' },
    });
    const postDurationSeconds = lastScore
      ? (ctx.now.getTime() - lastScore.createdAt.getTime()) / 1_000
      : null;

    await tx.roundJobScore.create({
      data: {
        roundId: ctx.round.id,
        participantId: ctx.participant.id,
        jobId,
        postDurationSeconds,
      },
    });

    const reachedAt = ctx.now;
    const participant = await tx.roundParticipant.update({
      where: { id: ctx.participant.id },
      data: {
        finalScore: { increment: 1 },
        scoreReachedAt: reachedAt,
        lastScoredAt: reachedAt,
      },
    });

    await tx.competitionEvent.create({
      data: {
        competitionId: ctx.round.competitionId,
        roundId: ctx.round.id,
        roundParticipantId: ctx.participant.id,
        eventType: CompetitionEventType.JOB_PUBLISHED,
        metadata: {
          jobId,
          finalScore: participant.finalScore,
          publishedAt: reachedAt.toISOString(),
          postDurationSeconds,
          ...extraMetadata,
        },
      },
    });

    await tx.job.update({ where: { id: jobId }, data: { scoredAt: reachedAt } });

    this.logger.log({
      event: 'score_updated',
      round_id: ctx.round.id,
      participant_id: ctx.participant.id,
      job_id: jobId,
      final_score: participant.finalScore,
      post_duration_seconds: postDurationSeconds,
    });

    return {
      scored: true,
      finalScore: participant.finalScore,
      scoreReachedAt: participant.scoreReachedAt,
      participantId: participant.id,
      postDurationSeconds,
    };
  }

  async recordUnpublish(
    tx: Prisma.TransactionClient,
    ctx: RoundPublishContext,
    jobId: string,
    extraMetadata: Record<string, unknown> = {},
  ): Promise<ScorePublishResult> {
    const deleted = await tx.roundJobScore.deleteMany({ where: { jobId } });

    if (deleted.count === 0) {
      const participant = await tx.roundParticipant.findUniqueOrThrow({
        where: { id: ctx.participant.id },
      });
      return {
        scored: false,
        finalScore: participant.finalScore,
        scoreReachedAt: participant.scoreReachedAt,
        participantId: participant.id,
        postDurationSeconds: null,
      };
    }

    let participant = await tx.roundParticipant.update({
      where: { id: ctx.participant.id },
      data: { finalScore: { decrement: 1 } },
    });

    if (participant.finalScore < 0) {
      participant = await tx.roundParticipant.update({
        where: { id: ctx.participant.id },
        data: { finalScore: 0 },
      });
    }

    await tx.competitionEvent.create({
      data: {
        competitionId: ctx.round.competitionId,
        roundId: ctx.round.id,
        roundParticipantId: ctx.participant.id,
        eventType: CompetitionEventType.JOB_UNPUBLISHED,
        metadata: { jobId, finalScore: participant.finalScore, ...extraMetadata },
      },
    });

    this.logger.log({
      event: 'score_reversed',
      round_id: ctx.round.id,
      participant_id: ctx.participant.id,
      job_id: jobId,
      final_score: participant.finalScore,
    });

    return {
      scored: true,
      finalScore: participant.finalScore,
      scoreReachedAt: participant.scoreReachedAt,
      participantId: participant.id,
      postDurationSeconds: null,
    };
  }
}
