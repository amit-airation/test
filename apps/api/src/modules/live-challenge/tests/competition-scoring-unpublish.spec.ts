import { CompetitionEventType } from '../../../generated/prisma/client.js';
import { CompetitionScoringService } from '../services/competition-scoring.service.js';
import type { CompetitionPublishContext } from '../validators/competition-job.validator/competition-job.validator.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';

describe('CompetitionScoringService.recordUnpublish', () => {
  const ctx = {
    competition: { id: 'comp-1' },
    participant: { id: 'part-1', finalScore: 1 },
    now: new Date('2026-09-14T10:00:00.000Z'),
  } as unknown as CompetitionPublishContext;

  function makeTx(overrides?: Record<string, unknown>) {
    return {
      competitionJobScore: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      competitionParticipant: {
        findUniqueOrThrow: vi.fn(),
        update: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'part-1',
            finalScore: -1,
            scoreReachedAt: ctx.now,
          })
          .mockResolvedValueOnce({
            id: 'part-1',
            finalScore: 0,
            scoreReachedAt: ctx.now,
          }),
      },
      competitionEvent: {
        create: vi.fn(),
      },
      ...overrides,
    };
  }

  it('floors the denormalized score at zero', async () => {
    const service = new CompetitionScoringService({} as PrismaService);
    const tx = makeTx();

    const result = await service.recordUnpublish(tx as never, ctx, 'job-1');

    expect(result.scored).toBe(true);
    expect(result.finalScore).toBe(0);
    expect(tx.competitionParticipant.update).toHaveBeenCalledTimes(2);
    expect(tx.competitionEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: CompetitionEventType.JOB_UNPUBLISHED,
        }),
      }),
    );
  });

  it('does not decrement when the job was never scored', async () => {
    const service = new CompetitionScoringService({} as PrismaService);
    const tx = makeTx({
      competitionJobScore: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      competitionParticipant: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'part-1',
          finalScore: 4,
          scoreReachedAt: ctx.now,
        }),
        update: vi.fn(),
      },
    });

    const result = await service.recordUnpublish(tx as never, ctx, 'job-1');

    expect(result.scored).toBe(false);
    expect(result.finalScore).toBe(4);
    expect(tx.competitionParticipant.update).not.toHaveBeenCalled();
  });
});
