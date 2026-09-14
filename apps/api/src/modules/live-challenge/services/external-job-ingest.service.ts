import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  CompetitionEventType,
  CompetitionStatus,
  JobSource,
  JobStatus,
  type Competition,
  type CompetitionParticipant,
  type Job,
  type User,
} from '../../../generated/prisma/client.js';
import { CompetitionMetricsService } from '../../../common/observability/competition-metrics.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  EXTERNAL_JOB_EVENTS,
  INGEST_REASONS,
} from '../constants.js';
import type { ExternalJobEventDto } from '../dto/external-job-event.dto/external-job-event.dto.js';
import { CompetitionJobValidator } from '../validators/competition-job.validator/competition-job.validator.js';
import { CompetitionRealtimeService } from './competition-realtime.service.js';
import { CompetitionScoringService } from './competition-scoring.service.js';
import { CompetitionTimerService } from './competition-timer.service.js';

export type ExternalJobIngestResult = {
  scored: boolean;
  my_score: number | null;
  competition_id: string | null;
  reason?: string;
  job_id?: string;
};

type LiveParticipation = CompetitionParticipant & {
  competition: Competition;
  user: Pick<User, 'id' | 'name'>;
};

@Injectable()
export class ExternalJobIngestService {
  private readonly logger = new Logger(ExternalJobIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: CompetitionScoringService,
    private readonly timer: CompetitionTimerService,
    private readonly validator: CompetitionJobValidator,
    private readonly realtime: CompetitionRealtimeService,
    private readonly metrics: CompetitionMetricsService,
  ) {}

  ingest(dto: ExternalJobEventDto): Promise<ExternalJobIngestResult> {
    if (dto.event === EXTERNAL_JOB_EVENTS.UNPUBLISHED) {
      return this.unpublish(dto);
    }
    return this.publish(dto);
  }

  private async publish(
    dto: ExternalJobEventDto,
  ): Promise<ExternalJobIngestResult> {
    const user = await this.prisma.user.findUnique({
      where: { externalUserId: dto.external_user_id },
    });
    if (!user) {
      return this.noop(INGEST_REASONS.UNKNOWN_EXTERNAL_USER);
    }

    const live = await this.resolveLiveParticipation(user.id);
    // `scored` is required on the result type, so it narrows both branches;
    // the optional `reason` would leave the union intact on the false branch.
    if ('scored' in live) {
      return live;
    }

    const now = this.timer.now();
    let publishCtx;
    try {
      publishCtx = this.validator.assertCanPublishCompetitionJob(
        live.competition,
        live,
        now,
      );
      this.validator.assertCompetitionJobFields({
        title: dto.job?.title ?? '',
        description: dto.job?.description,
        location: dto.job?.location,
        employmentType: dto.job?.employment_type,
      });
    } catch (error) {
      const reason = this.publishFailureReason(error);
      await this.prisma.competitionEvent.create({
        data: {
          competitionId: live.competitionId,
          participantId: live.id,
          eventType: CompetitionEventType.PUBLISH_FAILED,
          metadata: {
            externalJobId: dto.external_job_id,
            eventId: dto.event_id,
            reason,
            message: error instanceof Error ? error.message : 'publish_validation_failed',
          },
        },
      });
      return {
        scored: false,
        my_score: live.finalScore,
        competition_id: live.competitionId,
        reason,
      };
    }

    const extraMetadata = {
      source: JobSource.EXTERNAL,
      externalJobId: dto.external_job_id,
      eventId: dto.event_id,
      externalPublishedAt: dto.published_at ?? null,
    };

    const result = await this.prisma.$transaction(async (tx) => {
      const job = await this.upsertMirroredJob(tx, {
        dto,
        userId: user.id,
        companyId: live.companyId,
        competitionId: live.competitionId,
        now,
      });

      const score = await this.scoring.recordSuccessfulPublish(
        tx,
        publishCtx,
        job.id,
        extraMetadata,
      );

      return { job, score };
    });

    if (result.score.scored) {
      await this.realtime.emitScoreAndLeaderboard({
        competitionId: live.competitionId,
        participantId: result.score.participantId,
        userId: user.id,
        name: live.user.name,
        score: result.score.finalScore,
        previousScore: result.score.finalScore - 1,
        jobId: result.job.id,
      });
    }

    this.logger.log({
      event: 'external_job_ingested',
      competition_id: live.competitionId,
      participant_id: live.id,
      job_id: result.job.id,
      external_job_id: dto.external_job_id,
      scored: result.score.scored,
      final_score: result.score.finalScore,
    });

    return {
      scored: result.score.scored,
      my_score: result.score.finalScore,
      competition_id: live.competitionId,
      job_id: result.job.id,
      reason: result.score.scored ? undefined : INGEST_REASONS.ALREADY_SCORED,
    };
  }

  private async unpublish(
    dto: ExternalJobEventDto,
  ): Promise<ExternalJobIngestResult> {
    const user = await this.prisma.user.findUnique({
      where: { externalUserId: dto.external_user_id },
    });
    if (!user) {
      return this.noop(INGEST_REASONS.UNKNOWN_EXTERNAL_USER);
    }

    const job = await this.prisma.job.findUnique({
      where: { externalJobId: dto.external_job_id },
    });
    if (!job) {
      return this.noop(INGEST_REASONS.UNKNOWN_EXTERNAL_JOB);
    }
    if (job.createdById !== user.id) {
      throw new ForbiddenException({
        scored: false,
        my_score: null,
        competition_id: job.competitionId,
        reason: INGEST_REASONS.JOB_OWNER_MISMATCH,
        job_id: job.id,
      });
    }

    if (job.status === JobStatus.ARCHIVED) {
      return {
        scored: false,
        my_score: null,
        competition_id: job.competitionId,
        job_id: job.id,
        reason: INGEST_REASONS.ALREADY_UNPUBLISHED,
      };
    }

    if (!job.competitionId) {
      const archived = await this.archiveJob(job.id);
      return {
        scored: false,
        my_score: null,
        competition_id: null,
        job_id: archived.id,
        reason: INGEST_REASONS.NOT_SCORED,
      };
    }

    const competition = await this.prisma.competition.findUnique({
      where: { id: job.competitionId },
    });
    if (!competition) {
      return this.noop(INGEST_REASONS.UNKNOWN_EXTERNAL_JOB);
    }
    if (competition.status === CompetitionStatus.FINALIZED) {
      throw new ConflictException({
        scored: false,
        my_score: null,
        competition_id: competition.id,
        reason: INGEST_REASONS.COMPETITION_FINALIZED,
        job_id: job.id,
      });
    }

    const participant = await this.prisma.competitionParticipant.findUnique({
      where: {
        competitionId_userId: {
          competitionId: job.competitionId,
          userId: user.id,
        },
      },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!participant) {
      const archived = await this.archiveJob(job.id);
      return {
        scored: false,
        my_score: null,
        competition_id: job.competitionId,
        job_id: archived.id,
        reason: INGEST_REASONS.NOT_SCORED,
      };
    }

    const ctx = {
      competition,
      participant,
      now: this.timer.now(),
    };

    const result = await this.prisma.$transaction(async (tx) => {
      const archived = await tx.job.update({
        where: { id: job.id },
        data: {
          status: JobStatus.ARCHIVED,
          scoredAt: null,
        },
      });
      const score = await this.scoring.recordUnpublish(tx, ctx, archived.id, {
        source: JobSource.EXTERNAL,
        externalJobId: dto.external_job_id,
        eventId: dto.event_id,
      });
      return { job: archived, score };
    });

    if (result.score.scored) {
      await this.realtime.emitScoreAndLeaderboard({
        competitionId: competition.id,
        participantId: result.score.participantId,
        userId: user.id,
        name: participant.user.name,
        score: result.score.finalScore,
        previousScore: result.score.finalScore + 1,
        jobId: result.job.id,
      });
    }

    this.logger.log({
      event: 'external_job_unpublished',
      competition_id: competition.id,
      participant_id: participant.id,
      job_id: result.job.id,
      external_job_id: dto.external_job_id,
      reversed: result.score.scored,
      final_score: result.score.finalScore,
    });

    return {
      scored: result.score.scored,
      my_score: result.score.finalScore,
      competition_id: competition.id,
      job_id: result.job.id,
      reason: result.score.scored ? undefined : INGEST_REASONS.NOT_SCORED,
    };
  }

  private async resolveLiveParticipation(
    userId: string,
  ): Promise<LiveParticipation | ExternalJobIngestResult> {
    const matches = await this.prisma.competitionParticipant.findMany({
      where: {
        userId,
        competition: { status: CompetitionStatus.LIVE },
      },
      include: {
        competition: true,
        user: { select: { id: true, name: true } },
      },
    });

    if (matches.length === 0) {
      return this.noop(INGEST_REASONS.NO_LIVE_COMPETITION);
    }
    if (matches.length > 1) {
      throw new ConflictException({
        scored: false,
        my_score: null,
        competition_id: null,
        reason: INGEST_REASONS.MULTIPLE_LIVE_COMPETITIONS,
      });
    }
    return matches[0];
  }

  private async upsertMirroredJob(
    tx: Prisma.TransactionClient,
    input: {
      dto: ExternalJobEventDto;
      userId: string;
      companyId: string | null;
      competitionId: string;
      now: Date;
    },
  ): Promise<Job> {
    const existing = await tx.job.findUnique({
      where: { externalJobId: input.dto.external_job_id },
    });

    const data = {
      title: input.dto.job?.title?.trim() ?? 'Untitled job',
      description: input.dto.job?.description?.trim(),
      location: input.dto.job?.location?.trim(),
      employmentType: input.dto.job?.employment_type?.trim(),
      companyId: input.companyId,
      competitionId: input.competitionId,
      createdById: input.userId,
      status: JobStatus.PUBLISHED,
      source: JobSource.EXTERNAL,
      externalJobId: input.dto.external_job_id,
      publishedAt: input.now,
    };

    if (existing) {
      if (existing.createdById !== input.userId) {
        throw new ForbiddenException({
          scored: false,
          my_score: null,
          competition_id: input.competitionId,
          reason: INGEST_REASONS.JOB_OWNER_MISMATCH,
          job_id: existing.id,
        });
      }
      if (existing.status === JobStatus.PUBLISHED) {
        return existing;
      }
      return tx.job.update({
        where: { id: existing.id },
        data,
      });
    }

    try {
      return await tx.job.create({ data });
    } catch (error) {
      if (isPrismaUniqueConstraint(error)) {
        return tx.job.findUniqueOrThrow({
          where: { externalJobId: input.dto.external_job_id },
        });
      }
      throw error;
    }
  }

  private archiveJob(jobId: string) {
    return this.prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.ARCHIVED, scoredAt: null },
    });
  }

  private publishFailureReason(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('ended') || message.includes('no longer accepted')) {
      return INGEST_REASONS.COMPETITION_ENDED;
    }
    if (message.includes('not LIVE')) {
      return INGEST_REASONS.COMPETITION_NOT_LIVE;
    }
    return INGEST_REASONS.PUBLISH_REJECTED;
  }

  private noop(reason: string): ExternalJobIngestResult {
    return {
      scored: false,
      my_score: null,
      competition_id: null,
      reason,
    };
  }
}

function isPrismaUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  );
}
