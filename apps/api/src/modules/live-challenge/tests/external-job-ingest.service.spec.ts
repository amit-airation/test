import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  CompetitionStatus,
  JobStatus,
  ParticipantStatus,
} from '../../../generated/prisma/client.js';
import { INGEST_REASONS } from '../constants.js';
import type { ExternalJobEventDto } from '../dto/external-job-event.dto/external-job-event.dto.js';
import { CompetitionJobValidator } from '../validators/competition-job.validator/competition-job.validator.js';
import { ExternalJobIngestService } from '../services/external-job-ingest.service.js';
import { CompetitionScoringService } from '../services/competition-scoring.service.js';
import { CompetitionTimerService } from '../services/competition-timer.service.js';
import type { CompetitionRealtimeService } from '../services/competition-realtime.service.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';

const NOW = new Date('2026-09-14T10:00:00.000Z');
const END_AT = new Date('2026-09-14T10:05:00.000Z');
const START_AT = new Date('2026-09-14T09:55:00.000Z');

const user = {
  id: 'user-1',
  name: 'Rahul',
  externalUserId: 'hirance-user-123',
};

const competition = {
  id: 'comp-1',
  status: CompetitionStatus.LIVE,
  actualStartAt: START_AT,
  endAt: END_AT,
};

const participant = {
  id: 'part-1',
  userId: user.id,
  competitionId: competition.id,
  companyId: 'company-1',
  status: ParticipantStatus.ACTIVE,
  finalScore: 2,
  scoreReachedAt: START_AT,
  competition,
  user: { id: user.id, name: user.name },
};

function publishedEvent(
  overrides: Partial<ExternalJobEventDto> = {},
): ExternalJobEventDto {
  return {
    event_id: '11111111-1111-1111-1111-111111111111',
    event: 'JOB_PUBLISHED',
    external_user_id: user.externalUserId,
    external_job_id: 'hirance-job-987',
    published_at: '2026-09-14T09:59:00.000Z',
    job: {
      title: 'Senior Backend Engineer',
      description: 'Build NestJS APIs for live competitions',
      location: 'Remote',
      employment_type: 'FULL_TIME',
    },
    ...overrides,
  };
}

function makeService(options?: {
  now?: Date;
  prisma?: Partial<PrismaService> & Record<string, unknown>;
  scoring?: Partial<CompetitionScoringService>;
  realtime?: Partial<CompetitionRealtimeService>;
  tx?: Record<string, unknown>;
}) {
  const now = options?.now ?? NOW;
  const timer = {
    now: () => now,
  } as unknown as CompetitionTimerService;
  const validator = new CompetitionJobValidator(timer);

  const tx = {
    job: {
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn().mockResolvedValue({
        id: 'job-1',
        externalJobId: 'hirance-job-987',
        createdById: user.id,
        status: JobStatus.PUBLISHED,
      }),
      update: vi.fn(),
    },
    ...options?.tx,
  };

  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
    },
    competitionParticipant: {
      findMany: vi.fn().mockResolvedValue([participant]),
      findUnique: vi.fn().mockResolvedValue(participant),
    },
    competition: {
      findUnique: vi.fn().mockResolvedValue(competition),
    },
    job: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
    competitionEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    ...options?.prisma,
  } as unknown as PrismaService;

  const scoring = {
    recordSuccessfulPublish: vi.fn().mockResolvedValue({
      scored: true,
      finalScore: 3,
      scoreReachedAt: now,
      participantId: participant.id,
    }),
    recordUnpublish: vi.fn().mockResolvedValue({
      scored: true,
      finalScore: 1,
      scoreReachedAt: now,
      participantId: participant.id,
    }),
    ...options?.scoring,
  } as unknown as CompetitionScoringService;

  const realtime = {
    emitScoreAndLeaderboard: vi.fn().mockResolvedValue(undefined),
    ...options?.realtime,
  } as unknown as CompetitionRealtimeService;

  const service = new ExternalJobIngestService(
    prisma,
    scoring,
    timer,
    validator,
    realtime,
    { recordPublish: vi.fn() } as never,
  );

  return { service, prisma, scoring, realtime, tx, timer };
}

describe('ExternalJobIngestService', () => {
  it('returns unknown_external_user when the job-server id is not linked', async () => {
    const { service, prisma } = makeService({
      prisma: {
        user: { findUnique: vi.fn().mockResolvedValue(null) },
      } as never,
    });

    await expect(service.ingest(publishedEvent())).resolves.toEqual({
      scored: false,
      my_score: null,
      competition_id: null,
      reason: INGEST_REASONS.UNKNOWN_EXTERNAL_USER,
    });
    expect(prisma.competitionParticipant.findMany).not.toHaveBeenCalled();
  });

  it('no-ops when the user has no LIVE competition', async () => {
    const { service } = makeService({
      prisma: {
        competitionParticipant: { findMany: vi.fn().mockResolvedValue([]) },
      } as never,
    });

    await expect(service.ingest(publishedEvent())).resolves.toEqual({
      scored: false,
      my_score: null,
      competition_id: null,
      reason: INGEST_REASONS.NO_LIVE_COMPETITION,
    });
  });

  it('rejects more than one LIVE participation', async () => {
    const { service } = makeService({
      prisma: {
        competitionParticipant: {
          findMany: vi.fn().mockResolvedValue([participant, { ...participant, id: 'part-2' }]),
        },
      } as never,
    });

    await expect(service.ingest(publishedEvent())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('mirrors the job, scores once, and broadcasts after commit', async () => {
    const { service, scoring, realtime, tx } = makeService();

    await expect(service.ingest(publishedEvent())).resolves.toEqual({
      scored: true,
      my_score: 3,
      competition_id: competition.id,
      job_id: 'job-1',
      reason: undefined,
    });

    expect(tx.job.create).toHaveBeenCalled();
    expect(scoring.recordSuccessfulPublish).toHaveBeenCalledTimes(1);
    expect(realtime.emitScoreAndLeaderboard).toHaveBeenCalledWith(
      expect.objectContaining({
        competitionId: competition.id,
        score: 3,
        previousScore: 2,
        jobId: 'job-1',
      }),
    );
  });

  it('does not double-count a duplicate external_job_id', async () => {
    const existing = {
      id: 'job-1',
      createdById: user.id,
      status: JobStatus.PUBLISHED,
      externalJobId: 'hirance-job-987',
    };
    const { service, scoring, realtime, tx } = makeService({
      scoring: {
        recordSuccessfulPublish: vi.fn().mockResolvedValue({
          scored: false,
          finalScore: 3,
          scoreReachedAt: NOW,
          participantId: participant.id,
        }),
      },
      tx: {
        job: {
          findUnique: vi.fn().mockResolvedValue(existing),
          create: vi.fn(),
        },
      },
    });

    await expect(service.ingest(publishedEvent())).resolves.toEqual({
      scored: false,
      my_score: 3,
      competition_id: competition.id,
      job_id: 'job-1',
      reason: INGEST_REASONS.ALREADY_SCORED,
    });
    expect(tx.job.create).not.toHaveBeenCalled();
    expect(scoring.recordSuccessfulPublish).toHaveBeenCalledTimes(1);
    expect(realtime.emitScoreAndLeaderboard).not.toHaveBeenCalled();
  });

  it('treats a concurrent unique-constraint retry as already scored', async () => {
    const existing = {
      id: 'job-1',
      createdById: user.id,
      status: JobStatus.PUBLISHED,
      externalJobId: 'hirance-job-987',
    };
    const { service, scoring, realtime } = makeService({
      scoring: {
        recordSuccessfulPublish: vi.fn().mockResolvedValue({
          scored: false,
          finalScore: 1,
          scoreReachedAt: NOW,
          participantId: participant.id,
        }),
      },
      tx: {
        job: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockRejectedValue({ code: 'P2002' }),
          findUniqueOrThrow: vi.fn().mockResolvedValue(existing),
        },
      },
    });

    const [first, second] = await Promise.all([
      service.ingest(publishedEvent()),
      service.ingest(publishedEvent()),
    ]);

    expect(first.reason).toBe(INGEST_REASONS.ALREADY_SCORED);
    expect(second.reason).toBe(INGEST_REASONS.ALREADY_SCORED);
    expect(first.scored).toBe(false);
    expect(second.scored).toBe(false);
    expect(scoring.recordSuccessfulPublish).toHaveBeenCalled();
    expect(realtime.emitScoreAndLeaderboard).not.toHaveBeenCalled();
  });

  it('does not score a delivery that arrives at or after end_at', async () => {
    const { service, scoring, prisma } = makeService({
      now: END_AT,
    });

    await expect(service.ingest(publishedEvent())).resolves.toEqual({
      scored: false,
      my_score: participant.finalScore,
      competition_id: competition.id,
      reason: INGEST_REASONS.COMPETITION_ENDED,
    });
    expect(scoring.recordSuccessfulPublish).not.toHaveBeenCalled();
    expect(prisma.competitionEvent.create).toHaveBeenCalled();
  });

  it('reverses a previously scored external job', async () => {
    const existingJob = {
      id: 'job-1',
      createdById: user.id,
      competitionId: competition.id,
      status: JobStatus.PUBLISHED,
      externalJobId: 'hirance-job-987',
    };
    const { service, scoring, realtime, tx } = makeService({
      prisma: {
        job: { findUnique: vi.fn().mockResolvedValue(existingJob) },
      } as never,
      tx: {
        job: {
          update: vi.fn().mockResolvedValue({
            ...existingJob,
            status: JobStatus.ARCHIVED,
          }),
        },
      },
    });

    await expect(
      service.ingest(
        publishedEvent({
          event: 'JOB_UNPUBLISHED',
          job: undefined,
        }),
      ),
    ).resolves.toEqual({
      scored: true,
      my_score: 1,
      competition_id: competition.id,
      job_id: 'job-1',
      reason: undefined,
    });

    expect(scoring.recordUnpublish).toHaveBeenCalled();
    expect(tx.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: JobStatus.ARCHIVED }),
      }),
    );
    expect(realtime.emitScoreAndLeaderboard).toHaveBeenCalledWith(
      expect.objectContaining({
        score: 1,
        previousScore: 2,
      }),
    );
  });

  it('rejects unpublish after the competition is finalized', async () => {
    const existingJob = {
      id: 'job-1',
      createdById: user.id,
      competitionId: competition.id,
      status: JobStatus.PUBLISHED,
      externalJobId: 'hirance-job-987',
    };
    const { service } = makeService({
      prisma: {
        job: { findUnique: vi.fn().mockResolvedValue(existingJob) },
        competition: {
          findUnique: vi.fn().mockResolvedValue({
            ...competition,
            status: CompetitionStatus.FINALIZED,
          }),
        },
      } as never,
    });

    await expect(
      service.ingest(publishedEvent({ event: 'JOB_UNPUBLISHED', job: undefined })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects unpublish when the job belongs to another user', async () => {
    const { service } = makeService({
      prisma: {
        job: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'job-1',
            createdById: 'someone-else',
            competitionId: competition.id,
            status: JobStatus.PUBLISHED,
            externalJobId: 'hirance-job-987',
          }),
        },
      } as never,
    });

    await expect(
      service.ingest(publishedEvent({ event: 'JOB_UNPUBLISHED', job: undefined })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
