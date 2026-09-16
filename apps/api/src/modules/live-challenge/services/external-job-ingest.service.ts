import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  CompetitionEventType,
  JobSource,
  JobStatus,
  RoundStatus,
} from '../../../generated/prisma/client.js';
import { CompetitionMetricsService } from '../../../common/observability/competition-metrics.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { EXTERNAL_JOB_EVENTS, INGEST_REASONS, ROUND_GRACE_PERIOD_MS } from '../constants.js';
import type { ExternalJobEventDto } from '../dto/external-job-event.dto/external-job-event.dto.js';
import { resolveJobTitle } from '../utils/job-title.js';
import { CompetitionRealtimeService } from './competition-realtime.service.js';
import { RoundScoringService } from './round-scoring.service.js';
import { RoundTimerService } from './round-timer.service.js';

export type ExternalJobIngestResult = {
  scored: boolean;
  my_score: number | null;
  round_id: string | null;
  reason?: string;
  job_id?: string;
  post_duration_seconds?: number | null;
};

@Injectable()
export class ExternalJobIngestService {
  private readonly logger = new Logger(ExternalJobIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: RoundScoringService,
    private readonly timer: RoundTimerService,
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
    // Look up participant by company_id in a currently LIVE round
    const matches = await this.prisma.roundParticipant.findMany({
      where: {
        companyId: dto.company_id,
        round: { status: RoundStatus.LIVE },
      },
      include: {
        round: true,
        company: { select: { id: true, name: true } },
      },
    });

    if (matches.length === 0) {
      return this.noop(INGEST_REASONS.NO_LIVE_ROUND);
    }
    if (matches.length > 1) {
      return this.noop(INGEST_REASONS.MULTIPLE_LIVE_ROUNDS);
    }

    const live = matches[0];
    const { round } = live;
    const now = this.timer.now();

    // Enforce scoring window + grace period
    if (!this.timer.isWithinScoringWindow(round, now, ROUND_GRACE_PERIOD_MS)) {
      await this.prisma.competitionEvent.create({
        data: {
          competitionId: round.competitionId,
          roundId: round.id,
          roundParticipantId: live.id,
          eventType: CompetitionEventType.PUBLISH_FAILED,
          metadata: {
            externalJobId: dto.external_job_id,
            eventId: dto.event_id,
            reason: INGEST_REASONS.OUTSIDE_SCORING_WINDOW,
            now: now.toISOString(),
            endAt: round.endAt?.toISOString() ?? null,
          },
        },
      });
      this.metrics.recordPublish(false);
      return {
        scored: false,
        my_score: live.finalScore,
        round_id: round.id,
        reason: INGEST_REASONS.OUTSIDE_SCORING_WINDOW,
      };
    }

    // Validate job fields (title or name)
    const title = resolveJobTitle(dto.job);
    if (!title || title.length < 3) {
      await this.prisma.competitionEvent.create({
        data: {
          competitionId: round.competitionId,
          roundId: round.id,
          roundParticipantId: live.id,
          eventType: CompetitionEventType.PUBLISH_FAILED,
          metadata: {
            externalJobId: dto.external_job_id,
            eventId: dto.event_id,
            reason: INGEST_REASONS.PUBLISH_REJECTED,
            message: 'Job title/name must be at least 3 characters',
          },
        },
      });
      this.metrics.recordPublish(false);
      return {
        scored: false,
        my_score: live.finalScore,
        round_id: round.id,
        reason: INGEST_REASONS.PUBLISH_REJECTED,
      };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Optional company name refresh from the main server (display only)
      if (dto.company_name?.trim()) {
        await tx.company.update({
          where: { id: live.companyId },
          data: { name: dto.company_name.trim() },
        });
      }

      // Upsert the mirrored job record
      const job = await tx.job.upsert({
        where: { externalJobId: dto.external_job_id },
        create: {
          title,
          description: dto.job?.description,
          location: dto.job?.location,
          employmentType: dto.job?.employment_type,
          status: JobStatus.PUBLISHED,
          source: JobSource.EXTERNAL,
          externalJobId: dto.external_job_id,
          companyId: live.companyId,
          roundId: round.id,
          publishedAt: dto.published_at ? new Date(dto.published_at) : now,
        },
        update: {
          status: JobStatus.PUBLISHED,
          title,
          publishedAt: dto.published_at ? new Date(dto.published_at) : now,
          roundId: round.id,
        },
      });

      const score = await this.scoring.recordSuccessfulPublish(
        tx,
        { round, participant: live, now },
        job.id,
        {
          source: JobSource.EXTERNAL,
          externalJobId: dto.external_job_id,
          eventId: dto.event_id,
          externalPublishedAt: dto.published_at ?? null,
          title,
        },
      );

      return { job, score };
    });

    const companyName =
      dto.company_name?.trim() || live.company.name;

    if (result.score.scored) {
      await this.realtime.emitScoreAndLeaderboard({
        competitionId: round.competitionId,
        roundId: round.id,
        participantId: live.id,
        companyId: live.companyId,
        companyName,
        score: result.score.finalScore,
        previousScore: result.score.finalScore - 1,
        jobId: result.job.id,
        postDurationSeconds: result.score.postDurationSeconds,
      });
    }

    this.logger.log({
      event: 'external_job_ingested',
      round_id: round.id,
      participant_id: live.id,
      job_id: result.job.id,
      external_job_id: dto.external_job_id,
      scored: result.score.scored,
      final_score: result.score.finalScore,
      post_duration_seconds: result.score.postDurationSeconds,
    });
    this.metrics.recordPublish(true);

    return {
      scored: result.score.scored,
      my_score: result.score.finalScore,
      round_id: round.id,
      job_id: result.job.id,
      post_duration_seconds: result.score.postDurationSeconds,
      reason: result.score.scored ? undefined : INGEST_REASONS.ALREADY_SCORED,
    };
  }

  private async unpublish(
    dto: ExternalJobEventDto,
  ): Promise<ExternalJobIngestResult> {
    const job = await this.prisma.job.findUnique({
      where: { externalJobId: dto.external_job_id },
    });
    if (!job) return this.noop(INGEST_REASONS.UNKNOWN_EXTERNAL_JOB);

    if (job.companyId !== dto.company_id) {
      throw new ForbiddenException({
        scored: false,
        my_score: null,
        round_id: job.roundId,
        reason: INGEST_REASONS.JOB_OWNER_MISMATCH,
        job_id: job.id,
      });
    }

    if (job.status === JobStatus.ARCHIVED) {
      return {
        scored: false,
        my_score: null,
        round_id: job.roundId,
        job_id: job.id,
        reason: INGEST_REASONS.ALREADY_UNPUBLISHED,
      };
    }

    if (!job.roundId) {
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: JobStatus.ARCHIVED, scoredAt: null },
      });
      return {
        scored: false,
        my_score: null,
        round_id: null,
        job_id: job.id,
        reason: INGEST_REASONS.NOT_SCORED,
      };
    }

    const round = await this.prisma.round.findUnique({
      where: { id: job.roundId },
    });
    if (!round) return this.noop(INGEST_REASONS.UNKNOWN_EXTERNAL_JOB);

    if (round.status === RoundStatus.FINALIZED) {
      throw new ConflictException({
        scored: false,
        my_score: null,
        round_id: round.id,
        reason: INGEST_REASONS.ROUND_FINALIZED,
        job_id: job.id,
      });
    }

    const participant = await this.prisma.roundParticipant.findUnique({
      where: {
        roundId_companyId: { roundId: job.roundId, companyId: dto.company_id },
      },
      include: { company: { select: { name: true } } },
    });
    if (!participant) {
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: JobStatus.ARCHIVED, scoredAt: null },
      });
      return {
        scored: false,
        my_score: null,
        round_id: job.roundId,
        job_id: job.id,
        reason: INGEST_REASONS.NOT_SCORED,
      };
    }

    const now = this.timer.now();
    const result = await this.prisma.$transaction(async (tx) => {
      const archived = await tx.job.update({
        where: { id: job.id },
        data: { status: JobStatus.ARCHIVED, scoredAt: null },
      });
      const score = await this.scoring.recordUnpublish(
        tx,
        { round, participant, now },
        archived.id,
        {
          source: JobSource.EXTERNAL,
          externalJobId: dto.external_job_id,
          eventId: dto.event_id,
        },
      );
      return { job: archived, score };
    });

    if (result.score.scored) {
      await this.realtime.emitScoreAndLeaderboard({
        competitionId: round.competitionId,
        roundId: round.id,
        participantId: participant.id,
        companyId: participant.companyId,
        companyName: participant.company.name,
        score: result.score.finalScore,
        previousScore: result.score.finalScore + 1,
        jobId: result.job.id,
        postDurationSeconds: null,
      });
    }

    return {
      scored: result.score.scored,
      my_score: result.score.finalScore,
      round_id: round.id,
      job_id: result.job.id,
      reason: result.score.scored ? undefined : INGEST_REASONS.NOT_SCORED,
    };
  }

  private noop(reason: string): ExternalJobIngestResult {
    return { scored: false, my_score: null, round_id: null, reason };
  }
}
